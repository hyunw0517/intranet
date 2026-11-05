"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, Eye, Heart, Lock, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-client";
import { deletePost, likePost, pinPost, unlikePost } from "@/services/api/posts";
import type { PostDetail } from "@/types/post";
import { formatEventRange } from "../event-date";
import { usePost, usePostCache } from "../hooks/use-posts";
import { PostNotFound } from "./board-not-found";
import { CommentSection } from "./comment-section";
import { PostAttachments } from "./post-attachments";
import { PostAuthorLabel } from "./post-author";
import { RichTextContent } from "./rich-text-content";

// 게시글 상세: 본문 + 좋아요·고정·수정·삭제 + 댓글
// 버튼 표시는 서버가 계산한 can을 따른다. (실제 차단은 각 API가 다시 검사)
export function PostDetailView({ boardId, postId }: { boardId: number; postId: number }) {
  const { data: post, isPending, isError, error, refetch } = usePost(boardId, postId);

  if (isPending) return <LoadingState />;
  if (isError) {
    // 404: 없음·삭제·게시판 읽기 권한 없음 / 403: 볼 수 없는 비밀글
    if (error instanceof ApiError && error.status === 404) return <PostNotFound boardId={boardId} />;
    if (error instanceof ApiError && error.status === 403) {
      return (
        <div className="grid gap-4">
          <BackLink boardId={boardId} label="목록으로" />
          <ErrorState error={error} />
        </div>
      );
    }
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  // "(수정됨)"은 editedAt으로 판단한다. updatedAt은 조회수·좋아요·고정 변경(post.update)에도 바뀌어 쓸 수 없다. (docs/frontend/fe-06-posts.md)

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <BackLink boardId={boardId} label={post.board.name} />

      <article className="grid gap-6">
        <header className="grid gap-3 border-b pb-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {post.isPinned && (
              <Badge variant="secondary">
                <Pin aria-hidden />
                고정
              </Badge>
            )}
            {post.isSecret && (
              <Badge variant="outline">
                <Lock aria-hidden />
                비밀글
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight break-words">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <PostAuthorLabel
              author={post.author}
              departmentName={post.authorDepartmentName}
              positionName={post.authorPositionName}
              isAnonymous={post.board.isAnonymous}
            />
            <span className="tabular-nums">
              <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
              {post.editedAt && (
                // 회색 보조 텍스트, 마우스를 올리면 수정 시각
                <time
                  dateTime={post.editedAt}
                  title={`수정 ${formatDateTime(post.editedAt)}`}
                  className="ml-1 text-muted-foreground"
                >
                  (수정됨)
                </time>
              )}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Eye className="size-3.5" aria-hidden />
              <span className="sr-only">조회</span>
              {post.viewCount.toLocaleString()}
            </span>
          </div>
          {post.eventStartAt && post.eventEndAt && (
            <p className="inline-flex items-center gap-2 text-sm">
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">일정</span>
              <span className="tabular-nums">{formatEventRange(post.eventStartAt, post.eventEndAt, post.isAllDay)}</span>
            </p>
          )}
        </header>

        <RichTextContent html={post.content} />

        <PostAttachments boardId={boardId} postId={post.id} files={post.files} />

        <PostActions boardId={boardId} post={post} />
      </article>

      <CommentSection boardId={boardId} postId={postId} canComment={post.can.comment} isAnonymous={post.board.isAnonymous} />
    </div>
  );
}

function BackLink({ boardId, label }: { boardId: number; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground">
      <Link href={`/boards/${boardId}`}>
        <ChevronLeft aria-hidden />
        {label}
      </Link>
    </Button>
  );
}

// 본문 아래 버튼: 좋아요(가운데 왼쪽) / 고정·수정·삭제(오른쪽, 권한 있는 것만)
function PostActions({ boardId, post }: { boardId: number; post: PostDetail }) {
  const router = useRouter();
  const cache = usePostCache(boardId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 상세 캐시만 고친다. (상세를 다시 요청하면 조회수가 오른다) 목록의 수치는 다시 받는다.
  const pin = useMutation({
    mutationFn: (isPinned: boolean) => pinPost(boardId, post.id, isPinned),
    onSuccess: (_, isPinned) => {
      cache.patchDetail(post.id, () => ({ isPinned }));
      cache.invalidateLists();
      toast.success(isPinned ? "상단에 고정했습니다." : "고정을 해제했습니다.");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => deletePost(boardId, post.id),
    onSuccess: async () => {
      setConfirmOpen(false);
      cache.markDetailStale(post.id);
      await cache.invalidateLists();
      router.replace(`/boards/${boardId}`);
      toast.success("게시글을 삭제했습니다.");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <LikeButton boardId={boardId} post={post} />

      <div className="flex flex-wrap gap-2">
        {post.can.pin && (
          <Button variant="outline" size="sm" disabled={pin.isPending} onClick={() => pin.mutate(!post.isPinned)}>
            {post.isPinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
            {post.isPinned ? "고정 해제" : "상단 고정"}
          </Button>
        )}
        {post.can.edit && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/boards/${boardId}/posts/${post.id}/edit`}>
              <Pencil aria-hidden />
              수정
            </Link>
          </Button>
        )}
        {post.can.delete && (
          <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 aria-hidden />
            삭제
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="게시글을 삭제할까요?"
        description="삭제한 게시글은 목록에서 사라지고 되돌릴 수 없습니다."
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

// 좋아요 / 좋아요 취소 (처음 상태는 상세 응답의 liked)
// 성공하면 상세를 다시 요청하지 않고 liked·likeCount만 고친다. (상세 조회는 조회수를 올린다)
function LikeButton({ boardId, post }: { boardId: number; post: PostDetail }) {
  const cache = usePostCache(boardId);
  const liked = post.liked;

  const mutation = useMutation({
    mutationFn: (next: boolean) => (next ? likePost(boardId, post.id) : unlikePost(boardId, post.id)),
    onSuccess: (_, next) => {
      cache.patchDetail(post.id, (prev) => ({ liked: next, likeCount: prev.likeCount + (next ? 1 : -1) }));
      cache.invalidateLists();
    },
    // 다른 탭에서 이미 누른 경우 등은 서버 메시지(409·400)를 그대로 보여 준다.
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={liked}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(!liked)}
      className={cn(liked && "border-primary/40 text-primary hover:text-primary")}
    >
      <Heart className={cn(liked && "fill-current")} aria-hidden />
      좋아요
      <span className="tabular-nums">{post.likeCount.toLocaleString()}</span>
    </Button>
  );
}
