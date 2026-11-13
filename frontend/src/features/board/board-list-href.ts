"use client";

import { useSyncExternalStore } from "react";

// 게시판 목록(달력)으로 돌아가는 주소 기억
// 상세·글쓰기에서 "← 게시판"을 누르면 보던 조건(달력의 ?month=&view=, 목록의 page·검색·정렬)으로 돌아가게 한다.
// - BoardView가 주소가 바뀔 때마다 저장하고, 돌아가는 링크가 읽는다.
// - sessionStorage: 탭마다 따로, 탭을 닫으면 사라진다. (다른 탭에서 보던 조건과 섞이지 않게)
//   개인 브라우징·저장소 차단 등으로 쓸 수 없으면 조건 없는 게시판 주소로 돌아간다.

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
