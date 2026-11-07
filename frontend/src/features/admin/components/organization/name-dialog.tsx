"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-message";

export interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  label: string; // 입력 라벨 (예: "직급명")
  initialName?: string;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (name: string) => void;
  children?: React.ReactNode; // 이름 외 추가 입력 (예: 상위 부서 선택)
}

// 이름 하나를 입력받는 추가·수정 모달 (부서·직급·직책 공용, 백엔드 @Length(1, 50))
export function NameDialog({ open, onOpenChange, ...props }: NameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !props.pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        {/* 열릴 때마다 새로 마운트해 이전 입력값이 남지 않게 한다. */}
        {open && <NameForm {...props} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  title,
  description,
  label,
  initialName = "",
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  children,
}: Omit<NameDialogProps, "open" | "onOpenChange"> & { onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string>();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setNameError(`${label}을(를) 입력해 주세요.`);
    if (trimmed.length > 50) return setNameError(`${label}은(는) 50자 이하로 입력해 주세요.`);
    setNameError(undefined);
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <FormError message={error ? getErrorMessage(error) : null} />

      {children}

      <FormField id="name-dialog-name" label={label} required error={nameError}>
        <Input
          id="name-dialog-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          autoComplete="off"
          aria-invalid={!!nameError}
          aria-describedby="name-dialog-name-message"
        />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
