import Link from "next/link";
import { Eye, Heart, ImageOff, Images, Lock, Pin } from "lucide-react";
import { formatListDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BoardPermission, PostBoardInfo, PostListItem } from "@/types/post";
import { PostAuthorLabel } from "./post-author";
import { canOpenPost } from "./post-list";

interface PostGridProps {
  boardId: number;
  board: PostBoardInfo;
  perm: BoardPermission;
  pinned: PostListItem[];
  posts: PostListItem[];
}

// 앨범 게시판 목록: 대표 이미지(본문 첫 번째 이미지) 썸네일 그리드
// - 서버가 내려준 thumbnailUrl(긴 변 480px webp)만 쓴다. 원본은 상세에서만 연다.
// - 대표 이미지가 없는 글(일반 → 앨범으로 바뀐 게시판의 기존 글 등)과 볼 수 없는 비밀글은 대체 이미지로 표시한다.
// - 이미지가 2장 이상이면 우측 하단에 "+나머지 수 (이미지 아이콘)"을 붙인다. (서버 imageCount 기준)
// - 고정글은 앞에 두고 핀 표시만 붙인다.
export function PostGrid({ boardId, board, perm, pinned, posts }: PostGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {pinned.map((post) => (
        <PostCard key={`pin-${post.id}`} boardId={boardId} board={board} perm={perm} post={post} pinned />
      ))}
      {posts.map((post) => (
        <PostCard key={post.id} boardId={boardId} board={board} perm={perm} post={post} />
      ))}
    </ul>
  );
}

function PostCard({
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
  const canOpen = canOpenPost(post, perm);
  const comments = post._count.comments;
  // 대표 이미지가 보일 때만 나머지 수를 표시한다. (대표 이미지가 없으면 썸네일 자리가 대체 이미지라 "+N"이 어색함)
  const extraImages = post.thumbnailUrl ? Math.max(post.imageCount - 1, 0) : 0;

  const body = (
    <>
      <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
        {post.thumbnailUrl ? (
          // next/image 대신 <img>: 썸네일은 서버가 이미 줄여서 주고, /api 경로라 이미지 최적화 설정이 따로 필요해진다.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnailUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            {post.isSecret && !canOpen ? <Lock className="size-6" aria-hidden /> : <ImageOff className="size-6" aria-hidden />}
            <span className="sr-only">{post.isSecret && !canOpen ? "비밀글" : "대표 이미지 없음"}</span>
          </div>
        )}
        {pinned && (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium text-primary">
            <Pin className="size-3" aria-hidden />
            고정
          </span>
        )}
        {extraImages > 0 && (
          // 대표 이미지 외 나머지 이미지 수. 사진 위에서도 읽히도록 반투명 어두운 배경 (테마와 무관하게 같은 색)
          <span className="absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
            +{extraImages}
            <Images className="size-3.5" aria-hidden />
            <span className="sr-only">장의 이미지가 더 있습니다</span>
          </span>
        )}
      </div>

      <div className="mt-2 grid gap-0.5">
        <span className="flex min-w-0 items-center gap-1 text-sm">
          {post.isSecret && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="비밀글" />}
          <span className={cn("truncate", !canOpen && "text-muted-foreground")}>{post.title}</span>
          {comments > 0 && (
            <span className="shrink-0 text-xs tabular-nums text-primary" aria-label={`댓글 ${comments}개`}>
              [{comments}]
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <PostAuthorLabel
            author={post.author}
            departmentName={post.authorDepartmentName}
            positionName={post.authorPositionName}
            isAnonymous={board.isAnonymous}
            className="min-w-0 truncate"
          />
          <time dateTime={post.createdAt} className="shrink-0 tabular-nums">
            {formatListDate(post.createdAt)}
          </time>
        </span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" aria-hidden />
            <span className="sr-only">조회</span>
            {post.viewCount.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3.5" aria-hidden />
            <span className="sr-only">좋아요</span>
            {post.likeCount.toLocaleString()}
          </span>
        </span>
      </div>
    </>
  );

  return (
    <li className="min-w-0">
      {canOpen ? (
        <Link
          href={`/boards/${boardId}/posts/${post.id}`}
          className="group block rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {body}
        </Link>
      ) : (
        // 볼 수 없는 비밀글은 링크를 걸지 않는다. (열어도 서버가 403)
        <div title="작성자와 게시판 관리자만 볼 수 있는 글입니다.">{body}</div>
      )}
    </li>
  );
}
