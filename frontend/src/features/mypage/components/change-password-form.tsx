"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePassword } from "@/features/auth/api";
import { validateNewPassword, validatePasswordConfirm } from "@/features/auth/validation";
import { getErrorMessage } from "@/lib/error-message";
import { setAccessToken } from "@/services/api-client";
import { CurrentPasswordDialog } from "./current-password-dialog";

const INITIAL = { newPassword: "", newPasswordConfirm: "" };
type Values = typeof INITIAL;
type Errors = Partial<Record<keyof Values, string>>;

// 비밀번호 변경 (PATCH /auth/change/pw)
// [비밀번호 변경] → 새 비밀번호 검증 → 현재 비밀번호 모달 → 확인 시 요청
// 오류(현재 비밀번호 불일치, 새 비밀번호가 현재와 같음 등)는 모두 비밀번호에 관한 것이라 모달 안에 표시한다.
// 서버가 tokenVersion을 올려 기존 토큰을 모두 무효화하므로(다른 기기 로그인 포함),
// 응답의 새 access token으로 교체해야 이후 요청이 실패하지 않는다. (새 refresh 쿠키는 서버가 저장)
export function ChangePasswordForm() {
  const [values, setValues] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (currentPassword: string) => changePassword({ currentPassword, newPassword: values.newPassword }),
    onSuccess: ({ accessToken }) => {
      setAccessToken(accessToken);
      setConfirmOpen(false);
      setValues(INITIAL);
      toast.success("비밀번호를 변경했습니다. 다른 기기의 로그인은 모두 해제됩니다.");
    },
    onError: (error) => setDialogError(getErrorMessage(error)),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: Errors = {
      newPassword: validateNewPassword(values.newPassword),
      newPasswordConfirm: validatePasswordConfirm(values.newPassword, values.newPasswordConfirm),
    };
    const filtered = Object.fromEntries(Object.entries(next).filter(([, msg]) => msg)) as Errors;
    setErrors(filtered);
    if (Object.keys(filtered).length > 0) return;

    setDialogError(null);
    setConfirmOpen(true);
  };

  const handleConfirm = (currentPassword: string) => {
    // 서버도 검사하지만, 요청 전에 바로 알려 준다.
    if (currentPassword === values.newPassword) {
      setDialogError("새 비밀번호가 현재 비밀번호와 같습니다.");
      return;
    }
    setDialogError(null);
    mutation.mutate(currentPassword);
  };

  const fieldProps = (key: keyof Values) => ({
    id: `pw-${key}`,
    name: key,
    type: "password",
    autoComplete: "new-password",
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((prev) => ({ ...prev, [key]: e.target.value })),
    "aria-invalid": !!errors[key],
    "aria-describedby": `pw-${key}-message`,
  });

  return (
    <>
      <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pw-newPassword" label="새 비밀번호" required error={errors.newPassword} hint="8~20자">
            <Input {...fieldProps("newPassword")} />
          </FormField>
          <FormField id="pw-newPasswordConfirm" label="새 비밀번호 확인" required error={errors.newPasswordConfirm}>
            <Input {...fieldProps("newPasswordConfirm")} />
          </FormField>
        </div>

        <div className="flex justify-end">
          <Button type="submit">비밀번호 변경</Button>
        </div>
      </form>

      <CurrentPasswordDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="본인 확인"
        description="비밀번호를 변경하려면 현재 비밀번호를 입력해 주세요."
        confirmLabel="변경"
        pending={mutation.isPending}
        error={dialogError}
        onConfirm={handleConfirm}
      />
    </>
  );
}
