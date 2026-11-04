import Link from "next/link";
import { Eye, Heart, Lock, Pin } from "lucide-react";
import { formatListDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BoardPermission, PostBoardInfo, PostListItem } from "@/types/post";
import { PostAuthorLabel } from "./post-author";

interface PostListProps {
  boardId: number;
  board: PostBoardInfo;
  perm: BoardPermission;
  pinned: PostListItem[];
  posts: PostListItem[];
}

// 열 너비 (머리글과 행이 같은 값을 쓴다): 제목 | 작성자 | 작성일 | 조회 | 좋아요
const COLUMNS = "lg:grid lg:grid-cols-[minmax(0,1fr)_11rem_5.5rem_3.5rem_3.5rem] lg:items-center lg:gap-4";

// 게시글 목록
// - 넓은 화면(lg 이상, 사이드바를 뺀 본문이 충분할 때): 표처럼 열을 맞춘 행 / 모바일: 제목 아래에 작성자·날짜·수치를 한 줄로
// - 표(<table>) 대신 목록(<ul>)을 쓴 이유: 모바일에서 행을 카드 모양으로 바꾸기 쉽고, 행 전체가 링크다.
export function PostList({ boardId, board, perm, pinned, posts }: PostListProps) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div
        aria-hidden
        className={cn(
          "hidden border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground",
          COLUMNS,
        )}
      >
        <span>제목</span>
        <span>작성자</span>
        <span className="text-right">작성일</span>
        <span className="text-right">조회</span>
        <span className="text-right">좋아요</span>
      </div>
      <ul className="divide-y">
        {pinned.map((post) => (
          <PostRow key={`pin-${post.id}`} boardId={boardId} board={board} perm={perm} post={post} pinned />
        ))}
        {posts.map((post) => (
          <PostRow key={post.id} boardId={boardId} board={board} perm={perm} post={post} />
        ))}
      </ul>
    </div>
  );
}

function PostRow({
  boardId,
  board,
  perm,
  post,
  pinned,
}: {
  boardId: number;
  board: PostBoardInfo;
  perm: BoardPermission;
  post: PostListItem;
  pinned?: boolean;
}) {
  // 열 수 있는 글인지: 비밀글은 작성자 본인·게시판 관리자만. 서버는 볼 수 없는 비밀글의 작성자를 null로 보낸다.
  // (익명 게시판에서도 본인 글은 작성자가 오므로, 작성자가 있으면 본인 글이거나 볼 수 있는 글이다)
  const canOpen = !post.isSecret || perm.admin || post.author !== null;
  const comments = post._count.comments;

  const title = (
    <span className="flex min-w-0 items-center gap-1.5">
      {pinned && <Pin className="size-3.5 shrink-0 text-primary" aria-label="고정글" />}
      {post.isSecret && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="비밀글" />}
      <span className={cn("truncate", pinned && "font-medium", !canOpen && "text-muted-foreground")}>{post.title}</span>
      {comments > 0 && (
        <span className="shrink-0 text-xs tabular-nums text-primary" aria-label={`댓글 ${comments}개`}>
          [{comments}]
        </span>
      )}
    </span>
  );

  const meta = (
    <>
      <PostAuthorLabel
        author={post.author}
        departmentName={post.authorDepartmentName}
        positionName={post.authorPositionName}
        isAnonymous={board.isAnonymous}
        className="truncate"
      />
      <time dateTime={post.createdAt} className="tabular-nums lg:text-right">
        {formatListDate(post.createdAt)}
      </time>
      <span className="inline-flex items-center gap-1 tabular-nums lg:justify-end">
        <Eye className="size-3.5 lg:hidden" aria-hidden />
        <span className="sr-only">조회</span>
        {post.viewCount.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums lg:justify-end">
        <Heart className="size-3.5 lg:hidden" aria-hidden />
        <span className="sr-only">좋아요</span>
        {post.likeCount.toLocaleString()}
      </span>
    </>
  );

  const rowClass = cn("block px-4 py-3", COLUMNS, pinned && "bg-muted/30");
  const content = (
    <>
      {title}
      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground lg:contents lg:text-sm">
        {meta}
      </span>
    </>
  );

  return (
    <li>
      {canOpen ? (
        <Link
          href={`/boards/${boardId}/posts/${post.id}`}
          className={cn(rowClass, "transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none")}
        >
          {content}
        </Link>
      ) : (
        // 볼 수 없는 비밀글은 링크를 걸지 않는다. (열어도 서버가 403)
        <div className={rowClass} title="작성자와 게시판 관리자만 볼 수 있는 글입니다.">
          {content}
        </div>
      )}
    </li>
  );
}
