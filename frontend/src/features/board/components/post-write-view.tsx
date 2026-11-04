"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { PageHeader } from "@/components/layout/page-header";
import { getErrorMessage } from "@/lib/error-message";
import { ApiError } from "@/services/api-client";
import { createPost, updatePost, type PostInput } from "@/services/api/posts";
import { toEventInput } from "../event-date";
import { DEFAULT_POST_QUERY, usePost, usePostCache, usePosts } from "../hooks/use-posts";
import { BoardNotFound, NotFoundMessage, PostNotFound } from "./board-not-found";
import { EMPTY_POST_FORM, PostForm } from "./post-form";

// 게시글 작성 (/boards/[boardId]/write)
// 게시판 정보·권한은 목록 첫 페이지 응답을 쓴다. (게시판 단건 조회 API가 없음, 목록에서 넘어오면 캐시 재사용)
export function PostCreateView({ boardId }: { boardId: number }) {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = usePosts(boardId, DEFAULT_POST_QUERY);
  const cache = usePostCache(boardId);
  const listHref = `/boards/${boardId}`;

  const mutation = useMutation({
    mutationFn: (input: PostInput) => createPost(boardId, input),
    onSuccess: async (post) => {
      await cache.invalidateLists();
      toast.success("게시글을 등록했습니다.");
      router.replace(`/boards/${boardId}/posts/${post.id}`);
    },
  });

  if (isPending) return <LoadingState />;
  if (isError) {
    if (error instanceof ApiError && error.status === 404) return <BoardNotFound />;
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }
  if (!data.perm.write) {
    return (
      <NotFoundMessage
        title="글을 쓸 수 없습니다"
        description="이 게시판에 글을 쓸 권한이 없습니다."
        href={listHref}
        linkLabel="목록으로"
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="글쓰기" description={data.board.name} />
      <PostForm
        board={data.board}
        initial={EMPTY_POST_FORM}
        showPin={data.perm.admin}
        submitLabel="등록"
        cancelHref={listHref}
        pending={mutation.isPending || mutation.isSuccess}
        serverError={mutation.isError ? getErrorMessage(mutation.error) : null}
        onSubmit={(input) => mutation.mutate(input)}
      />
    </div>
  );
}

// 게시글 수정 (/boards/[boardId]/posts/[postId]/edit) - 작성자만
// 상세 응답(본문·게시판 설정·can)을 그대로 쓴다. 상세 조회는 조회수를 올리므로, 상세에서 넘어오면 캐시를 다시 요청하지 않는다.
export function PostEditView({ boardId, postId }: { boardId: number; postId: number }) {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = usePost(boardId, postId, { staleTime: Infinity });
  const cache = usePostCache(boardId);
  const detailHref = `/boards/${boardId}/posts/${postId}`;

  const mutation = useMutation({
    mutationFn: (input: PostInput) => updatePost(boardId, postId, input),
    onSuccess: async () => {
      // 수정한 본문·소속 스냅샷은 상세로 돌아갈 때 새로 받는다.
      cache.markDetailStale(postId);
      await cache.invalidateLists();
      toast.success("게시글을 수정했습니다.");
      router.replace(detailHref);
    },
  });

  if (isPending) return <LoadingState />;
  if (isError) {
    if (error instanceof ApiError && error.status === 404) return <PostNotFound boardId={boardId} />;
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }
  if (!data.can.edit) {
    return (
      <NotFoundMessage
        title="수정할 수 없습니다"
        description="게시글은 작성자만 수정할 수 있습니다."
        href={detailHref}
        linkLabel="게시글로 돌아가기"
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="글 수정" description={data.board.name} />
      <PostForm
        board={data.board}
        initial={{
          title: data.title,
          content: data.content ?? "",
          isSecret: data.isSecret,
          isPinned: data.isPinned,
          event: toEventInput(data.eventStartAt, data.eventEndAt, data.isAllDay),
        }}
        showPin={false}
        submitLabel="저장"
        cancelHref={detailHref}
        pending={mutation.isPending || mutation.isSuccess}
        serverError={mutation.isError ? getErrorMessage(mutation.error) : null}
        onSubmit={(input) => mutation.mutate(input)}
      />
    </div>
  );
}
