"use client";

import { useSyncExternalStore } from "react";

// 게시판 목록으로 돌아가는 주소 기억
// 상세·글쓰기의 "← 게시판"이 보던 조건(페이지·검색·정렬, 달력의 달·보기)으로 돌아가게 한다.
// sessionStorage라 탭마다 따로 두고, 쓸 수 없으면 조건 없는 주소로 돌아간다.

const storageKey = (boardId: number) => `board-list-href:${boardId}`;
const defaultHref = (boardId: number) => `/boards/${boardId}`;

export function rememberBoardListHref(boardId: number, href: string) {
  try {
    sessionStorage.setItem(storageKey(boardId), href);
  } catch {
    // 저장할 수 없으면 기본 주소를 쓴다.
  }
}

export function readBoardListHref(boardId: number): string {
  try {
    const href = sessionStorage.getItem(storageKey(boardId));
    // 이 게시판 주소일 때만 쓴다. (저장값이 바뀌어 다른 곳으로 보내지 않게)
    if (href && (href === defaultHref(boardId) || href.startsWith(`${defaultHref(boardId)}?`))) return href;
  } catch {
    // 읽을 수 없으면 기본 주소
  }
  return defaultHref(boardId);
}

// 렌더링용: 서버 렌더링과 첫 렌더에서는 기본 주소, 브라우저에서는 저장된 주소 (hydration 불일치 방지)
const noopSubscribe = () => () => {};
export function useBoardListHref(boardId: number): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => readBoardListHref(boardId),
    () => defaultHref(boardId),
  );
}
