"use client";

import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/error-message";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createComment, deleteComment, updateComment } from "@/services/api/comments";
import type { PostComment } from "@/types/post";
import { useCommentMutation, useComments } from "../hooks/use-posts";
import { PostAuthorLabel } from "./post-author";

const THREADS_PER_PAGE = 20; // 한 페이지의 최상위 댓글 수 (답글은 부모와 같은 페이지에 붙어 다닌다)
const MAX_INDENT = 4; // 화면 들여쓰기 한도 (대댓글 깊이 자체는 제한하지 않는다, CLAUDE.md 5.3)
const COMMENT_MAX = 1000; // CreateCommentDto @MaxLength(1000)

// 트리 순서의 평평한 목록 → 최상위 댓글 단위 묶음(스레드)
// 서버가 부모 → 자식 순서로 주므로, depth 0이 나올 때마다 새 스레드를 시작하면 된다.
// 평평한 목록을 개수로 자르면 답글이 부모와 다른 페이지로 떨어지기 때문에 스레드로 나눈다.
function toThreads(comments: PostComment[]) {
  const threads: PostComment[][] = [];
  for (const c of comments) {
    if (c.depth === 0 || threads.length === 0) threads.push([c]);
    else threads[threads.length - 1].push(c);
  }
  return threads;
}

// 열려 있는 입력창 (한 번에 하나만: 답글 쓰기 또는 수정)
type ActiveEditor = { type: "reply" | "edit"; commentId: number } | null;

interface CommentSectionProps {
  boardId: number;
  postId: number;
  canComment: boolean; // 댓글 권한 (없으면 읽기만, 서버도 작성·수정·삭제를 403)
  isAnonymous: boolean;
}

export function CommentSection({ boardId, postId, canComment, isAnonymous }: CommentSectionProps) {
  const { data, isPending, isError, error, refetch } = useComments(boardId, postId);
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<ActiveEditor>(null);

  const threads = data ? toThreads(data) : [];
  const totalPages = Math.max(Math.ceil(threads.length / THREADS_PER_PAGE), 1);
  const current = Math.min(page, totalPages); // 삭제로 페이지 수가 줄어든 경우
  const visible = threads.slice((current - 1) * THREADS_PER_PAGE, current * THREADS_PER_PAGE).flat();
  const count = data?.filter((c) => !c.deleted).length ?? 0;
  const byId = new Map(data?.map((c) => [c.id, c]));

  return (
    <section aria-labelledby="comments-title" className="grid gap-4 border-t pt-6">
      <h2 id="comments-title" className="flex items-center gap-2 font-semibold">
        <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
        댓글
        <span className="tabular-nums text-muted-foreground">{count}</span>
      </h2>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState message="첫 댓글을 남겨 보세요." />
      ) : (
        <ul className="grid">
          {visible.map((c) => (
            <CommentItem
              key={c.id}
              boardId={boardId}
              postId={postId}
              comment={c}
              parent={c.parentCommentId ? byId.get(c.parentCommentId) : undefined}
              canComment={canComment}
              isAnonymous={isAnonymous}
              active={active}
              onActiveChange={setActive}
            />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <PaginationBar
          meta={{
            page: current,
            take: THREADS_PER_PAGE,
            total: threads.length,
            totalPages,
            hasNext: current < totalPages,
            hasPrevious: current > 1,
          }}
          onPageChange={setPage}
        />
      )}

      {canComment ? (
        <CommentComposer
          boardId={boardId}
          postId={postId}
          parentCommentId={null}
          // 새 최상위 댓글은 맨 뒤(작성순)에 붙으므로 마지막 페이지로 이동한다.
          onDone={() => setPage(Math.ceil((threads.length + 1) / THREADS_PER_PAGE))}
        />
      ) : (
        <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">이 게시판에 댓글을 쓸 권한이 없습니다.</p>
      )}
    </section>
  );
}

function CommentItem({
  boardId,
  postId,
  comment: c,
  parent,
  canComment,
  isAnonymous,
  active,
  onActiveChange,
}: {
  boardId: number;
  postId: number;
  comment: PostComment;
  parent?: PostComment;
  canComment: boolean;
  isAnonymous: boolean;
  active: ActiveEditor;
  onActiveChange: (active: ActiveEditor) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const remove = useCommentMutation(boardId, postId, () => deleteComment(boardId, postId, c.id));

  const replying = active?.type === "reply" && active.commentId === c.id;
  const editing = active?.type === "edit" && active.commentId === c.id;
  const edited = new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() > 1000;
  // 들여쓰기 한도보다 깊은 답글은 같은 위치에 그려지므로 누구에게 단 답글인지 이름을 붙인다.
  const replyTo = c.depth > MAX_INDENT && parent?.author ? parent.author.name : null;

  return (
    <li
      // 깊이만큼 들여쓰기 (모바일은 절반 폭). 깊이 값은 CSS 변수로 넘긴다.
      style={{ "--indent": Math.min(c.depth, MAX_INDENT) } as React.CSSProperties}
      className={cn(
        "border-b py-3 last:border-b-0 pl-[calc(var(--indent)*0.75rem)] md:pl-[calc(var(--indent)*1.5rem)]",
      )}
    >
      <div className={cn("grid gap-1.5", c.depth > 0 && "border-l-2 border-border/70 pl-3")}>
        {c.deleted ? (
          <p className="py-1 text-sm text-muted-foreground">(삭제된 댓글입니다)</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
              <PostAuthorLabel
                author={c.author}
                departmentName={c.authorDepartmentName}
                positionName={c.authorPositionName}
                isAnonymous={isAnonymous}
              />
              <time dateTime={c.createdAt} className="text-xs tabular-nums text-muted-foreground">
                {formatDateTime(c.createdAt)}
                {edited && " (수정됨)"}
              </time>
            </div>

            {editing ? (
              <CommentEditor
                boardId={boardId}
                postId={postId}
                comment={c}
                onDone={() => onActiveChange(null)}
              />
            ) : (
              // 댓글은 일반 텍스트다. (HTML로 해석하지 않으므로 React가 이스케이프, 줄바꿈만 살린다)
              <p className="whitespace-pre-wrap break-words">
                {replyTo && <span className="mr-1 text-primary">@{replyTo}</span>}
                {c.comment}
              </p>
            )}

            {!editing && (canComment || c.can.edit || c.can.delete) && (
              <div className="-ml-2 flex gap-0.5">
                {canComment && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    aria-expanded={replying}
                    onClick={() => onActiveChange(replying ? null : { type: "reply", commentId: c.id })}
                  >
                    답글
                  </Button>
                )}
                {c.can.edit && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    onClick={() => onActiveChange({ type: "edit", commentId: c.id })}
                  >
                    수정
                  </Button>
                )}
                {c.can.delete && (
                  <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setConfirmOpen(true)}>
                    삭제
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {replying && (
          <CommentComposer
            boardId={boardId}
            postId={postId}
            parentCommentId={c.id}
            autoFocus
            onCancel={() => onActiveChange(null)}
            onDone={() => onActiveChange(null)}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="댓글을 삭제할까요?"
        description="답글이 있으면 자리는 남고 '(삭제된 댓글입니다)'로 표시됩니다."
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              setConfirmOpen(false);
              toast.success("댓글을 삭제했습니다.");
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </li>
  );
}

// 새 댓글·답글 입력 (Ctrl/⌘ + Enter로 등록)
function CommentComposer({
  boardId,
  postId,
  parentCommentId,
  autoFocus,
  onCancel,
  onDone,
}: {
  boardId: number;
  postId: number;
  parentCommentId: number | null;
  autoFocus?: boolean;
  onCancel?: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const mutation = useCommentMutation(boardId, postId, (comment: string) =>
    createComment(boardId, postId, { comment, parentCommentId }),
  );

  const submit = () => {
    if (!text.trim() || mutation.isPending) return;
    mutation.mutate(text, {
      onSuccess: () => {
        setText("");
        onDone();
      },
    });
  };

  return (
    <CommentTextForm
      id={parentCommentId ? `reply-${parentCommentId}` : "comment-new"}
      label={parentCommentId ? "답글" : "댓글"}
      value={text}
      onChange={setText}
      onSubmit={submit}
      onCancel={onCancel}
      submitLabel={parentCommentId ? "답글 등록" : "등록"}
      pending={mutation.isPending}
      error={mutation.isError ? getErrorMessage(mutation.error) : null}
      autoFocus={autoFocus}
    />
  );
}

function CommentEditor({
  boardId,
  postId,
  comment,
  onDone,
}: {
  boardId: number;
  postId: number;
  comment: PostComment;
  onDone: () => void;
}) {
  const [text, setText] = useState(comment.comment ?? "");
  const mutation = useCommentMutation(boardId, postId, (value: string) => updateComment(boardId, postId, comment.id, value));

  const submit = () => {
    if (!text.trim() || mutation.isPending) return;
    mutation.mutate(text, { onSuccess: onDone });
  };

  return (
    <CommentTextForm
      id={`edit-${comment.id}`}
      label="댓글 수정"
      value={text}
      onChange={setText}
      onSubmit={submit}
      onCancel={onDone}
      submitLabel="저장"
      pending={mutation.isPending}
      error={mutation.isError ? getErrorMessage(mutation.error) : null}
      autoFocus
    />
  );
}

function CommentTextForm({
  id,
  label,
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  pending,
  error,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  autoFocus?: boolean;
}) {
  const blank = !value.trim(); // 공백만 있는 댓글은 서버도 400

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        maxLength={COMMENT_MAX}
        placeholder={label === "댓글 수정" ? undefined : `${label}을 입력하세요`}
        autoFocus={autoFocus}
        rows={3}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-message` : undefined}
        className="min-h-20 resize-y"
      />
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-xs tabular-nums text-muted-foreground", error && "text-destructive")} id={`${id}-message`}>
          {error ?? `${value.length.toLocaleString()} / ${COMMENT_MAX.toLocaleString()}`}
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
              취소
            </Button>
          )}
          <Button type="submit" size="sm" disabled={blank || pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
