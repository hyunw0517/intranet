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

interface CurrentPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  error?: string | null;
  onConfirm: (currentPassword: string) => void;
}

// 저장 직전에 본인 확인용 현재 비밀번호를 입력받는 모달 (내 정보 수정, 비밀번호 변경 공용)
// 모달이 열릴 때마다 새로 마운트되도록 내용 부분을 분리해 입력값이 남지 않게 한다.
export function CurrentPasswordDialog({ open, onOpenChange, ...props }: CurrentPasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !props.pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">{open && <DialogBody {...props} onCancel={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function DialogBody({
  title,
  description,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: Omit<CurrentPasswordDialogProps, "open" | "onOpenChange"> & { onCancel: () => void }) {
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string>();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation(); // 모달이 바깥 폼 안에 렌더링되어도 바깥 폼이 제출되지 않게
    if (!password) {
      setFieldError("현재 비밀번호를 입력해 주세요.");
      return;
    }
    setFieldError(undefined);
    onConfirm(password);
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <FormError message={error} />

      <FormField id="confirm-currentPassword" label="현재 비밀번호" error={fieldError}>
        <Input
          id="confirm-currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!fieldError}
          aria-describedby="confirm-currentPassword-message"
        />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
