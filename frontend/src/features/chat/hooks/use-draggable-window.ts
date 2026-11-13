"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Offset = { x: number; y: number };

const ORIGIN: Offset = { x: 0, y: 0 };
// 이 너비 미만은 창이 화면 전체로 열리므로(chat-window.tsx의 sm:) 끌기를 끈다.
const DRAGGABLE_QUERY = "(min-width: 640px)";
// 끌기를 시작하지 않는 요소 (위쪽 줄의 뒤로·메뉴·닫기 버튼 등)
const INTERACTIVE = "button, a, input, textarea, select, [role='menuitem']";

// 떠 있는 창을 위쪽 줄(data-chat-drag-handle)을 잡고 옮긴다. (2026-11-13 사용자 결정: 창을 닫으면 원래 자리)
// - 위치는 기본 자리(오른쪽 아래)에서 얼마나 옮겼는지(offset)만 두고 transform으로 그린다.
//   창이 닫히면 컴포넌트가 사라지므로 다음에 열 때 원래 자리다. 저장소에 남기지 않는다.
// - 창 전체가 화면 안에 있도록 제한한다. 브라우저 크기가 바뀌면 다시 맞춘다.
// - 끄는 동안 포인터를 창에 묶어(setPointerCapture) 커서가 빨리 움직여도 끊기지 않고, 글자 선택도 막는다.
// - 위쪽 줄을 두 번 누르면 원래 자리로 돌아간다.
export function useDraggableWindow() {
  const ref = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState<Offset>(ORIGIN);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; start: Offset; rect: DOMRect } | null>(null);

  // 화면 크기가 바뀌면 화면 안으로 다시 맞춘다. 좁아져 화면 전체 모드가 되면 원래 자리로.
  useEffect(() => {
    const handleResize = () => {
      const el = ref.current;
      if (!el) return;
      if (!window.matchMedia(DRAGGABLE_QUERY).matches) {
        setOffset(ORIGIN);
        return;
      }
      const rect = el.getBoundingClientRect();
      const dx = clampShift(rect.left, rect.right, window.innerWidth);
      const dy = clampShift(rect.top, rect.bottom, window.innerHeight);
      if (dx !== 0 || dy !== 0) setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      if (e.button !== 0 || !target.closest("[data-chat-drag-handle]") || target.closest(INTERACTIVE)) return;
      if (!window.matchMedia(DRAGGABLE_QUERY).matches) return;
      e.preventDefault(); // 글자 선택 방지
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        start: offset,
        rect: e.currentTarget.getBoundingClientRect(),
      };
      setDragging(true);
    },
    [offset],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const { rect } = drag;
    // 시작할 때의 창 위치 기준으로, 창이 화면 밖으로 나가지 않는 만큼만 움직인다.
    const dx = clamp(e.clientX - drag.startX, -rect.left, window.innerWidth - rect.right);
    const dy = clamp(e.clientY - drag.startY, -rect.top, window.innerHeight - rect.bottom);
    setOffset({ x: drag.start.x + dx, y: drag.start.y + dy });
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }, []);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-chat-drag-handle]") && !target.closest(INTERACTIVE)) setOffset(ORIGIN);
  }, []);

  return {
    ref,
    dragging,
    style: offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onDoubleClick },
  };
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
