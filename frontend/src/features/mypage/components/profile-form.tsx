"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateMe } from "@/features/auth/api";
import type { CurrentUser } from "@/features/auth/types";
import {
  normalizePhone,
  validateEmail,
  validateName,
  validateNickname,
  validatePhone,
} from "@/features/auth/validation";
import { getErrorMessage } from "@/lib/error-message";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/services/api-client";
import { CurrentPasswordDialog } from "./current-password-dialog";

function toFormValues(user: CurrentUser) {
  return {
    name: user.name,
    email: user.email,
    nickname: user.nickname ?? "",
    birthday: user.birthday ? user.birthday.slice(0, 10) : "", // DATE 컬럼 → yyyy-MM-dd
    hp: user.hp ?? "",
    tel: user.tel ?? "",
  };
}

type Values = ReturnType<typeof toFormValues>;
type Errors = Partial<Record<keyof Values, string>>;

// 현재 비밀번호 불일치는 백엔드가 401로 응답한다. → 모달 안에 표시하고 다시 입력받는다.
// 그 외 오류(이메일 중복 등)는 폼 내용을 고쳐야 하므로 모달을 닫고 폼 위에 표시한다.
const isWrongPassword = (error: unknown) => error instanceof ApiError && error.status === 401;

// 내 정보 수정 (PATCH /users/me)
// [저장] → 입력값 검증 → 현재 비밀번호 모달 → 확인 시 요청
// 선택 항목을 비우면 빈 문자열을 보내 서버에서 null로 저장된다.
export function ProfileForm({ user }: { user: CurrentUser }) {
  const { setUser } = useAuth();
  const [values, setValues] = useState<Values>(() => toFormValues(user));
  const [errors, setErrors] = useState<Errors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (currentPassword: string) =>
      updateMe({
        name: values.name.trim(),
        email: values.email.trim(),
        nickname: values.nickname.trim(),
        birthday: values.birthday,
        hp: normalizePhone(values.hp),
        tel: normalizePhone(values.tel),
        currentPassword,
      }),
    onSuccess: (updated) => {
      setConfirmOpen(false);
      setUser(updated);
      toast.success("내 정보를 저장했습니다.");
    },
    onError: (error) => {
      if (!isWrongPassword(error)) setConfirmOpen(false);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: Errors = {
      name: validateName(values.name),
      email: validateEmail(values.email),
      nickname: validateNickname(values.nickname),
      hp: validatePhone(values.hp),
      tel: validatePhone(values.tel),
    };
    const filtered = Object.fromEntries(Object.entries(next).filter(([, msg]) => msg)) as Errors;
    setErrors(filtered);
    if (Object.keys(filtered).length > 0) return;

    mutation.reset(); // 이전 오류 메시지 지우기
    setConfirmOpen(true);
  };

  const fieldProps = (key: keyof Values) => ({
    id: `profile-${key}`,
    name: key,
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((prev) => ({ ...prev, [key]: e.target.value })),
    "aria-invalid": !!errors[key],
    "aria-describedby": `profile-${key}-message`,
  });

  const formError = mutation.error && !isWrongPassword(mutation.error) ? getErrorMessage(mutation.error) : null;
  const dialogError = mutation.error && isWrongPassword(mutation.error) ? getErrorMessage(mutation.error) : null;

  return (
    <>
      <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
        <FormError message={formError} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="profile-name" label="이름" required error={errors.name}>
            <Input {...fieldProps("name")} autoComplete="name" />
          </FormField>
          <FormField id="profile-nickname" label="닉네임" error={errors.nickname}>
            <Input {...fieldProps("nickname")} autoComplete="nickname" />
          </FormField>
        </div>

        <FormField id="profile-email" label="이메일" required error={errors.email}>
          <Input {...fieldProps("email")} type="email" autoComplete="email" />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="profile-birthday" label="생년월일" error={errors.birthday}>
            <Input {...fieldProps("birthday")} type="date" autoComplete="bday" />
          </FormField>
          <FormField id="profile-hp" label="휴대폰" error={errors.hp}>
            <Input {...fieldProps("hp")} type="tel" inputMode="numeric" autoComplete="tel" />
          </FormField>
          <FormField id="profile-tel" label="전화" error={errors.tel}>
            <Input {...fieldProps("tel")} type="tel" inputMode="numeric" />
          </FormField>
        </div>

        <div className="flex justify-end">
          <Button type="submit">저장</Button>
        </div>
      </form>

      <CurrentPasswordDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="본인 확인"
        description="내 정보를 저장하려면 현재 비밀번호를 입력해 주세요."
        confirmLabel="저장"
        pending={mutation.isPending}
        error={dialogError}
        onConfirm={(currentPassword) => mutation.mutate(currentPassword)}
      />
    </>
  );
}
