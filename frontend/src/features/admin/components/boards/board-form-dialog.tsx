"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import type { BoardInput } from "@/services/api/boards";
import { BOARD_TYPE_LABEL, SELECTABLE_BOARD_TYPES, type AdminBoard, type BoardType } from "@/types/board";

const ROOT = "root"; // 상위 없음(최상위). Select는 빈 문자열 값을 쓸 수 없어 별도 값으로 둔다.

export type BoardDialogState =
  | { mode: "add"; parentId: number | null }
  | { mode: "edit"; board: AdminBoard }
  | null;

interface BoardFormDialogProps {
  state: BoardDialogState;
  onClose: () => void;
  boards: AdminBoard[]; // 상위 카테고리 후보를 고르기 위한 전체 목록
  pending: boolean;
  error: unknown;
  onSubmit: (input: BoardInput) => void;
}

// 게시판 추가·수정 모달 (백엔드 CreateBoardDto / UpdateBoardDto)
export function BoardFormDialog({ state, onClose, ...props }: BoardFormDialogProps) {
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !props.pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {/* 열릴 때마다 새로 마운트해 이전 입력값이 남지 않게 한다. */}
        {state && <BoardForm state={state} onCancel={onClose} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function BoardForm({
  state,
  boards,
  pending,
  error,
  onSubmit,
  onCancel,
}: Omit<BoardFormDialogProps, "state" | "onClose"> & { state: NonNullable<BoardDialogState>; onCancel: () => void }) {
  const editing = state.mode === "edit" ? state.board : null;
  const initialParentId = editing ? editing.parentBoardId : state.mode === "add" ? state.parentId : null;

  const [type, setType] = useState<BoardType>(editing?.type ?? "NORMAL");
  const [parentValue, setParentValue] = useState(initialParentId === null ? ROOT : String(initialParentId));
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [isAnonymous, setIsAnonymous] = useState(editing?.isAnonymous ?? false);
  const [allowSecret, setAllowSecret] = useState(editing?.allowSecret ?? false);
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});

  const isCategory = type === "CATEGORY";
  // 수정 시 목록 응답에 현재 값이 없으면 옵션을 보내지 않는다. (보내면 모르는 값을 false로 덮어쓰게 됨)
  const optionsKnown = !editing || (editing.isAnonymous !== undefined && editing.allowSecret !== undefined);

  // 상위 후보: 카테고리만 (자기 자신 제외). 카테고리는 최상위에만 둘 수 있다.
  const categories = boards.filter((b) => b.type === "CATEGORY" && b.id !== editing?.id);
  // 앨범은 아직 선택지에 없지만, 이미 앨범인 게시판을 수정할 때는 현재 값이 보이도록 넣는다.
  const typeOptions = editing && !SELECTABLE_BOARD_TYPES.includes(editing.type) ? [...SELECTABLE_BOARD_TYPES, editing.type] : SELECTABLE_BOARD_TYPES;

  const handleTypeChange = (value: string) => {
    const next = value as BoardType;
    setType(next);
    if (next === "CATEGORY") setParentValue(ROOT);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const nextErrors: typeof errors = {};
    if (!trimmedName) nextErrors.name = "게시판명을 입력해 주세요.";
    else if (trimmedName.length > 50) nextErrors.name = "게시판명은 50자 이하로 입력해 주세요.";
    if (trimmedDescription.length > 250) nextErrors.description = "설명은 250자 이하로 입력해 주세요.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({
      name: trimmedName,
      type,
      parentBoardId: isCategory || parentValue === ROOT ? null : Number(parentValue),
      description: trimmedDescription,
      ...(!isCategory && optionsKnown ? { isAnonymous, allowSecret } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "게시판 수정" : "게시판 추가"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "게시글이 있으면 카테고리·캘린더로(또는 캘린더에서) 타입을 바꿀 수 없습니다."
            : "카테고리는 게시판을 묶는 용도이며, 게시판은 최상위나 카테고리 아래에 둘 수 있습니다."}
        </DialogDescription>
      </DialogHeader>

      <FormError message={error ? getErrorMessage(error) : null} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="board-type" label="타입" required>
          <Select value={type} onValueChange={handleTypeChange}>
            <SelectTrigger id="board-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {BOARD_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          id="board-parent"
          label="상위 카테고리"
          hint={isCategory ? "카테고리는 최상위에만 둘 수 있습니다." : undefined}
        >
          <Select value={parentValue} onValueChange={setParentValue} disabled={isCategory}>
            <SelectTrigger id="board-parent" className="w-full" aria-describedby="board-parent-message">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT}>없음 (최상위)</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField id="board-name" label={isCategory ? "카테고리명" : "게시판명"} required error={errors.name}>
        <Input
          id="board-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          autoComplete="off"
          aria-invalid={!!errors.name}
          aria-describedby="board-name-message"
        />
      </FormField>

      <FormField id="board-description" label="설명" error={errors.description} hint="250자 이하, 비워 두어도 됩니다.">
        <Input
          id="board-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoComplete="off"
          aria-invalid={!!errors.description}
          aria-describedby="board-description-message"
        />
      </FormField>

      {!isCategory && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">게시판 옵션</legend>
          <OptionCheckbox
            id="board-anonymous"
            label="익명 게시판"
            checked={isAnonymous}
            onChange={setIsAnonymous}
            disabled={!optionsKnown}
          />
          <OptionCheckbox
            id="board-secret"
            label="비밀글 허용"
            checked={allowSecret}
            onChange={setAllowSecret}
            disabled={!optionsKnown}
          />
          {!optionsKnown && (
            <p className="text-xs text-muted-foreground">
              현재 설정값을 불러오지 못해 수정 화면에서는 옵션을 바꿀 수 없습니다. (저장해도 기존 값이 유지됩니다)
            </p>
          )}
        </fieldset>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : "추가"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function OptionCheckbox({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} disabled={disabled} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
