"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PostInput } from "@/services/api/posts";
import { cn } from "@/lib/utils";
import type { CalendarEventColor } from "@/types/calendar";
import type { PostBoardInfo } from "@/types/post";
import { EVENT_COLOR_OPTIONS } from "../calendar-colors";
import { EMPTY_EVENT, toEventPayload, validateEvent, type EventInput } from "../event-date";
import type { FileInfo } from "@/types/file";
import { AttachmentField } from "./attachment-field";
import { RichTextEditor } from "./rich-text-editor";

const TITLE_MAX = 100; // CreatePostDto @Length(1, 100)

export interface PostFormValues {
  title: string;
  content: string;
  isSecret: boolean;
  isPinned: boolean;
  event: EventInput;
  files: FileInfo[]; // 첨부파일 (수정 화면은 기존 첨부)
}

export const EMPTY_POST_FORM: PostFormValues = {
  title: "",
  content: "",
  isSecret: false,
  isPinned: false,
  event: EMPTY_EVENT,
  files: [],
};

interface PostFormProps {
  board: PostBoardInfo;
  initial: PostFormValues;
  showPin: boolean; // 작성 화면 + 게시판 관리자일 때만 (수정 화면의 고정은 상세에서 따로 한다)
  requireImage?: boolean; // 앨범 게시판 작성 화면만 (수정은 검사하지 않는다 - 서버 규칙과 같음)
  submitLabel: string;
  cancelHref: string;
  pending: boolean;
  serverError: string | null;
  onSubmit: (input: PostInput) => void;
}

// 게시글 작성·수정 폼
// 게시판 설정에 따라 입력이 달라진다. (서버도 같은 기준으로 값을 무시·검사한다)
// - 비밀글: 비밀글 허용 게시판만 / 일정: 캘린더 게시판만 / 고정: 작성 화면의 게시판 관리자만
// - 앨범 게시판 작성: 본문 이미지 1개 이상 (첫 번째 이미지가 목록 그리드의 대표 이미지)
export function PostForm({
  board,
  initial,
  showPin,
  requireImage = false,
  submitLabel,
  cancelHref,
  pending,
  serverError,
  onSubmit,
}: PostFormProps) {
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [contentEmpty, setContentEmpty] = useState(!initial.content);
  const [isSecret, setIsSecret] = useState(initial.isSecret);
  const [isPinned, setIsPinned] = useState(initial.isPinned);
  const [event, setEvent] = useState(initial.event);
  const [files, setFiles] = useState(initial.files);
  const [errors, setErrors] = useState<{ title?: string; event?: string; content?: string }>({});
  // 이미지·첨부 업로드 중에는 등록을 막는다. (올라가기 전 파일이 빠진 채 저장되지 않게)
  const [imageUploading, setImageUploading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const uploading = imageUploading || fileUploading;

  const isCalendar = board.type === "CALENDAR";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending || uploading) return;

    const next: typeof errors = {};
    if (!title.trim()) next.title = "제목을 입력하세요.";
    if (isCalendar) next.event = validateEvent(event) ?? undefined;
    if (requireImage && !content.includes("<img")) next.content = "앨범 게시판은 본문에 이미지를 1개 이상 넣어야 합니다.";
    setErrors(next);
    if (next.title || next.event || next.content) return;

    onSubmit({
      title: title.trim(),
      // 빈 에디터는 "<p></p>"를 돌려주므로 빈 문자열로 보낸다. (서버도 빈 본문을 null로 저장)
      content: contentEmpty ? "" : content,
      ...(board.allowSecret ? { isSecret } : {}),
      ...(showPin ? { isPinned } : {}),
      ...(isCalendar ? toEventPayload(event) : {}),
      // 항상 최종 목록을 보낸다. (수정에서 모두 빼면 빈 배열 → 서버가 기존 첨부 삭제)
      attachmentIds: files.map((f) => f.id),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
      <FormError message={serverError} />

      <FormField id="post-title" label="제목" required error={errors.title}>
        <Input
          id="post-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "post-title-message" : undefined}
          className="h-9"
          autoFocus={!initial.title}
        />
      </FormField>

      {isCalendar && (
        <EventFields
          value={event}
          onChange={(next) => {
            setEvent(next);
            // 값을 고치면 오류 표시를 지운다. (다시 등록할 때 재검사)
            if (errors.event) setErrors((prev) => ({ ...prev, event: undefined }));
          }}
          error={errors.event}
        />
      )}

      <div className="grid gap-1.5">
        <Label id="post-content-label">
          내용
          {requireImage && <span className="font-normal text-muted-foreground">(이미지 1개 이상, 첫 번째 이미지가 대표 이미지)</span>}
        </Label>
        <RichTextEditor
          id="post-content"
          labelledBy="post-content-label"
          initialContent={initial.content}
          onChange={(html, isEmpty) => {
            setContent(html);
            setContentEmpty(isEmpty);
            if (errors.content && html.includes("<img")) setErrors((prev) => ({ ...prev, content: undefined }));
          }}
          onUploadingChange={setImageUploading}
        />
        {errors.content && (
          <p id="post-content-message" role="alert" className="text-xs text-destructive">
            {errors.content}
          </p>
        )}
      </div>

      <AttachmentField value={files} onChange={setFiles} onUploadingChange={setFileUploading} />

      {(board.allowSecret || showPin) && (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {board.allowSecret && (
            <CheckField
              id="post-secret"
              label="비밀글"
              hint="작성자와 게시판 관리자만 볼 수 있습니다."
              checked={isSecret}
              onChange={setIsSecret}
            />
          )}
          {showPin && (
            <CheckField
              id="post-pin"
              label="상단 고정"
              hint="모든 페이지 위에 표시됩니다. (게시판당 최대 10개)"
              checked={isPinned}
              onChange={setIsPinned}
            />
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button asChild variant="outline">
          <Link href={cancelHref}>취소</Link>
        </Button>
        <Button type="submit" disabled={pending || uploading}>
          {(pending || uploading) && <Loader2 className="animate-spin" aria-hidden />}
          {uploading ? "파일 올리는 중" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CheckField({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        aria-describedby={`${id}-hint`}
        className="mt-0.5"
      />
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}

// 캘린더 게시판 일정 (시작·종료 필수, 종일이면 날짜만)
function EventFields({
  value,
  onChange,
  error,
}: {
  value: EventInput;
  onChange: (value: EventInput) => void;
  error?: string;
}) {
  const set = (patch: Partial<EventInput>) => onChange({ ...value, ...patch });
  const invalid = !!error;

  return (
    <fieldset className="grid gap-3 rounded-lg border p-4" aria-describedby={error ? "post-event-message" : undefined}>
      <legend className="px-1 text-sm font-medium">
        일정
        <span className="text-destructive" aria-hidden>
          *
        </span>
      </legend>
      <div className="flex items-center gap-2">
        <Checkbox id="post-all-day" checked={value.isAllDay} onCheckedChange={(v) => set({ isAllDay: v === true })} />
        <Label htmlFor="post-all-day">종일</Label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateTimeInput
          label="시작"
          idPrefix="post-start"
          allDay={value.isAllDay}
          date={value.startDate}
          time={value.startTime}
          invalid={invalid}
          // 종료일이 비어 있으면 시작일로 채워 같은 날 일정을 쉽게 입력하게 한다.
          onDate={(startDate) => set({ startDate, endDate: value.endDate || startDate })}
          onTime={(startTime) => set({ startTime })}
        />
        <DateTimeInput
          label="종료"
          idPrefix="post-end"
          allDay={value.isAllDay}
          date={value.endDate}
          time={value.endTime}
          invalid={invalid}
          onDate={(endDate) => set({ endDate })}
          onTime={(endTime) => set({ endTime })}
        />
      </div>
      <EventColorPicker value={value.color} onChange={(color) => set({ color })} />
      {error && (
        <p id="post-event-message" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

// 일정 색 고르기 (정해진 색 중 하나, 2026-11-12 사용자 결정) - 달력의 일정 박스 색
function EventColorPicker({ value, onChange }: { value: CalendarEventColor | null; onChange: (color: CalendarEventColor | null) => void }) {
  return (
    <div className="grid gap-1.5">
      <span id="post-event-color-label" className="text-sm font-medium">
        색상
      </span>
      <div role="radiogroup" aria-labelledby="post-event-color-label" className="flex flex-wrap gap-2">
        {EVENT_COLOR_OPTIONS.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={o.label}
              title={o.label}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                o.swatch,
                selected && "ring-2 ring-foreground",
              )}
            >
              {selected && <Check className="size-4 text-white" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DateTimeInput({
  label,
  idPrefix,
  allDay,
  date,
  time,
  invalid,
  onDate,
  onTime,
}: {
  label: string;
  idPrefix: string;
  allDay: boolean;
  date: string;
  time: string;
  invalid: boolean;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${idPrefix}-date`}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={date}
          onChange={(e) => onDate(e.target.value)}
          aria-invalid={invalid}
          className="min-w-0"
        />
        {!allDay && (
          <Input
            type="time"
            value={time}
            onChange={(e) => onTime(e.target.value)}
            aria-label={`${label} 시간`}
            aria-invalid={invalid}
            className="w-32 shrink-0"
          />
        )}
      </div>
    </div>
  );
}
