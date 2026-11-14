"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Offset = { x: number; y: number };
type Size = { width: number; height: number };
// 위치(offset) + 크기(size, null = CSS 기본 크기)
type Frame = { offset: Offset; size: Size | null };
// 크기 조절 손잡이 방향 (n=위, s=아래, e=오른쪽, w=왼쪽)
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const DEFAULT_FRAME: Frame = { offset: { x: 0, y: 0 }, size: null };
// 이 너비 미만은 창이 화면 전체로 열리므로(chat-window.tsx의 sm:) 옮기기·크기 조절을 끈다.
const FLOATING_QUERY = "(min-width: 640px)";
// 옮기기를 시작하지 않는 요소 (위쪽 줄의 뒤로·메뉴·닫기 버튼 등)
const INTERACTIVE = "button, a, input, textarea, select, [role='menuitem']";
// 브라우저 저장소 키 (2026-11-14 사용자 결정: 위치·크기를 이 브라우저에 기억)
const STORAGE_KEY = "intranet.chat-window";

// 크기 최소·최대 (2026-11-14 사용자 요청: 자유롭게 조절하되 최소·최대는 정한다)
// - 최소: 입력창·메뉴·파일 줄(w-60)이 깨지지 않는 크기
// - 최대: 너비 720px, 높이는 화면 높이까지 (둘 다 화면 가장자리 16px씩 남김)
export const CHAT_WINDOW_MIN = { width: 320, height: 420 } as const;
const MAX_WIDTH = 720;
// chat-window.tsx의 기본 자리(sm:right-4 sm:bottom-4)·기본 크기(sm:w-[380px] sm:h-[min(640px,calc(100dvh-5rem))])와 같은 값
const VIEWPORT_MARGIN = 16;
const DEFAULT_WIDTH = 380;
const defaultHeight = () => Math.min(640, window.innerHeight - 80);

// 떠 있는 채팅 창의 위치·크기
// - 위치는 기본 자리(오른쪽 아래)에서 얼마나 옮겼는지(offset)만 두고 transform으로 그린다.
// - 크기는 처음엔 CSS 기본값이고, 가장자리·모서리를 끌면 px 값(size)으로 바뀐다.
// - 위치·크기는 localStorage에 남겨 새로고침·다시 로그인해도 그대로 연다(이 브라우저에서만).
//   위쪽 줄을 두 번 누르면 원래 자리·크기로 돌아가고 저장값도 지운다.
// - 창 전체가 화면 안에 있도록 제한한다. 열 때(저장값이 다른 화면 크기에서 만든 값일 수 있음)와 브라우저 크기가 바뀔 때 다시 맞춘다.
// - 화면 전체 모드(모바일 폭)에서는 위치·크기를 적용하지 않는다. 저장값은 지우지 않아 다시 넓어지면 그대로 쓴다.
// - 끄는 동안 포인터를 창에 묶어(setPointerCapture) 커서가 빨리 움직여도 끊기지 않고, 글자 선택도 막는다.
// (이 훅은 창이 열릴 때만 그려진다 - ChatProvider의 open이 false로 시작해 서버 렌더링 때는 window를 읽지 않는다)
export function useFloatingWindow() {
  const ref = useRef<HTMLElement>(null);
  const [frame, setFrame] = useState<Frame>(() => fitToViewport(loadFrame()));
  const [floating, setFloating] = useState(() => window.matchMedia(FLOATING_QUERY).matches);
  const [active, setActive] = useState(false);
  const actionRef = useRef<{
    pointerId: number;
    edge: ResizeEdge | null; // null = 옮기기
    startX: number;
    startY: number;
    start: Offset;
    rect: DOMRect;
  } | null>(null);
  // 마지막으로 누른 곳이 위쪽 줄(옮기기 손잡이)인지.
  // 두 번 누르기(dblclick)는 포인터를 창에 묶은 뒤라 대상(target)이 위쪽 줄이 아니라 창 전체로 와서, 누를 때 기록해 둔 값으로 판단한다.
  const pressedHandleRef = useRef(false);

  // 화면 크기가 바뀌면 화면 안으로 다시 맞춘다.
  useEffect(() => {
    const handleResize = () => {
      const wide = window.matchMedia(FLOATING_QUERY).matches;
      setFloating(wide);
      if (wide) setFrame((f) => fitToViewport(f));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 끄는 중이 아닐 때 저장한다 (끄는 동안 매 움직임마다 쓰지 않도록)
  useEffect(() => {
    if (!active && floating) saveFrame(frame);
  }, [frame, active, floating]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      const edge = (target.closest("[data-chat-resize]")?.getAttribute("data-chat-resize") ?? null) as ResizeEdge | null;
      const onHandle = !edge && !!target.closest("[data-chat-drag-handle]") && !target.closest(INTERACTIVE);
      pressedHandleRef.current = onHandle;
      if (e.button !== 0 || !floating || (!edge && !onHandle)) return;
      e.preventDefault(); // 글자 선택 방지
      e.currentTarget.setPointerCapture(e.pointerId);
      actionRef.current = {
        pointerId: e.pointerId,
        edge,
        startX: e.clientX,
        startY: e.clientY,
        start: frame.offset,
        rect: e.currentTarget.getBoundingClientRect(),
      };
      setActive(true);
    },
    [frame.offset, floating],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const action = actionRef.current;
    if (!action || action.pointerId !== e.pointerId) return;
    const { rect, edge, start } = action;
    const moveX = e.clientX - action.startX;
    const moveY = e.clientY - action.startY;

    // 옮기기: 시작할 때의 창 위치 기준으로, 창이 화면 밖으로 나가지 않는 만큼만 움직인다.
    if (!edge) {
      const dx = clamp(moveX, -rect.left, window.innerWidth - rect.right);
      const dy = clamp(moveY, -rect.top, window.innerHeight - rect.bottom);
      setFrame((f) => ({ ...f, offset: { x: start.x + dx, y: start.y + dy } }));
      return;
    }

    // 크기 조절: 끄는 쪽 가장자리만 움직이고 반대쪽은 그 자리에 둔다. 최소·최대와 화면 끝을 넘지 않는다.
    // 창은 오른쪽·아래가 기준(right·bottom + transform)이라, 오른쪽·아래 가장자리를 끌 때는 늘어난 만큼 offset도 옮긴다.
    const max = maxSize();
    let { width, height } = rect;
    let { x, y } = start;
    if (edge.includes("w")) width = clamp(rect.width - moveX, CHAT_WINDOW_MIN.width, Math.min(max.width, rect.right));
    if (edge.includes("e")) {
      width = clamp(rect.width + moveX, CHAT_WINDOW_MIN.width, Math.min(max.width, window.innerWidth - rect.left));
      x = start.x + (width - rect.width);
    }
    if (edge.includes("n")) height = clamp(rect.height - moveY, CHAT_WINDOW_MIN.height, Math.min(max.height, rect.bottom));
    if (edge.includes("s")) {
      height = clamp(rect.height + moveY, CHAT_WINDOW_MIN.height, Math.min(max.height, window.innerHeight - rect.top));
      y = start.y + (height - rect.height);
    }
    setFrame({ offset: { x, y }, size: { width, height } });
  }, []);

  const endAction = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (actionRef.current?.pointerId !== e.pointerId) return;
    actionRef.current = null;
    setActive(false);
  }, []);

  // 위쪽 줄을 두 번 누르면 원래 자리·크기 (저장값은 saveFrame이 기본값을 받으면 지운다)
  const onDoubleClick = useCallback(() => {
    if (pressedHandleRef.current) setFrame(DEFAULT_FRAME);
  }, []);

  const style: React.CSSProperties = {};
  if (floating) {
    const { offset, size } = frame;
    if (offset.x || offset.y) style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    if (size) {
      style.width = size.width;
      style.height = size.height;
    }
  }

  return {
    ref,
    // 옮기거나 크기를 바꾸는 중 (글자 선택 막기용)
    active,
    style,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endAction, onPointerCancel: endAction, onDoubleClick },
  };
}

function maxSize(): Size {
  return {
    width: Math.max(CHAT_WINDOW_MIN.width, Math.min(MAX_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)),
    height: Math.max(CHAT_WINDOW_MIN.height, window.innerHeight - VIEWPORT_MARGIN * 2),
  };
}

// 지금 화면에 맞춘 위치·크기: 크기는 최소~최대 안으로, 창 전체가 화면 안에 들어오도록 위치를 옮긴다.
// DOM을 읽지 않고 기본 자리(오른쪽 아래 16px)에서 계산하므로 창을 그리기 전(저장값 불러올 때)에도 쓸 수 있다.
function fitToViewport({ offset, size }: Frame): Frame {
  const max = maxSize();
  const fitted = size && {
    width: clamp(size.width, CHAT_WINDOW_MIN.width, max.width),
    height: clamp(size.height, CHAT_WINDOW_MIN.height, max.height),
  };
  const width = fitted?.width ?? DEFAULT_WIDTH;
  const height = fitted?.height ?? defaultHeight();
  const right = window.innerWidth - VIEWPORT_MARGIN + offset.x;
  const bottom = window.innerHeight - VIEWPORT_MARGIN + offset.y;
  return {
    offset: {
      x: offset.x + clampShift(right - width, right, window.innerWidth),
      y: offset.y + clampShift(bottom - height, bottom, window.innerHeight),
    },
    size: fitted,
  };
}

// 저장소는 막혀 있거나(설정·시크릿 창) 값이 망가져 있을 수 있다 → 그때는 기본값
function loadFrame(): Frame {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FRAME;
    const v = JSON.parse(raw) as Partial<Frame>;
    const offset = v.offset && isNum(v.offset.x) && isNum(v.offset.y) ? { x: v.offset.x, y: v.offset.y } : DEFAULT_FRAME.offset;
    const size = v.size && isNum(v.size.width) && isNum(v.size.height) ? { width: v.size.width, height: v.size.height } : null;
    return { offset, size };
  } catch {
    return DEFAULT_FRAME;
  }
}

function saveFrame({ offset, size }: Frame) {
  try {
    if (!size && !offset.x && !offset.y) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ offset, size }));
  } catch {
    // 저장하지 못해도 창은 그대로 쓴다
  }
}

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// [start, end]가 [0, size] 안에 들어오도록 옮길 거리 (이미 안이면 0)
function clampShift(start: number, end: number, size: number) {
  if (start < 0) return -start;
  if (end > size) return Math.max(size - end, -start);
  return 0;
}
