"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-message";
import { toDateInputValue } from "@/lib/format";
import {
  normalizePhone,
  validateEmail,
  validateEmpNo,
  validateName,
  validateNickname,
  validatePhone,
} from "@/lib/validation/user";
import { adminUpdateUser, type AdminUpdateUserInput, type AdminUserDetail } from "@/services/api/users";
import { useAdminUserMutation } from "../../hooks/use-admin-users";

export function toFormValues(user: AdminUserDetail) {
  return {
    empNo: user.empNo,
    name: user.name,
    nickname: user.nickname ?? "",
    email: user.email,
    birthday: toDateInputValue(user.birthday),
    hp: user.hp ?? "",
    tel: user.tel ?? "",
    joinAt: toDateInputValue(user.joinAt),
  };
}

type Values = ReturnType<typeof toFormValues>;
type Errors = Partial<Record<keyof Values, string>>;

// 관리자 회원 정보 수정 (PATCH /users/:id)
// 본인 수정과 달리 현재 비밀번호 확인이 없고, 사번·입사일도 수정한다. 비밀번호는 [비밀번호 초기화]로만 바꾼다.
// 선택 항목을 비우면 빈 문자열을 보내 서버에서 null로 저장된다.
// 부모가 서버 값으로 key를 주므로, 저장이나 다른 화면(목록의 권한·상태 모달 등)으로 서버 값이 바뀌면 폼이 새 값으로 다시 채워진다.
// (key가 없으면 이전 값을 들고 있다가 저장할 때 방금 바뀐 값을 덮어쓴다)
export function UserInfoForm({ user }: { user: AdminUserDetail }) {
  const [values, setValues] = useState<Values>(() => toFormValues(user));
  const [errors, setErrors] = useState<Errors>({});
  const mutation = useAdminUserMutation((input: AdminUpdateUserInput) => adminUpdateUser(user.id, input));
  const isApproved = user.role !== "GUEST";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: Errors = {
      empNo: validateEmpNo(values.empNo),
      name: validateName(values.name),
      email: validateEmail(values.email),
      nickname: validateNickname(values.nickname),
      hp: validatePhone(values.hp),
      tel: validatePhone(values.tel),
      // 승인된 회원은 입사일을 비울 수 없다. (연차 계산에 필요, 서버도 400)
      joinAt: isApproved && !values.joinAt ? "승인된 회원은 입사일을 비울 수 없습니다." : undefined,
    };
    const filtered = Object.fromEntries(Object.entries(next).filter(([, msg]) => msg)) as Errors;
    setErrors(filtered);
    if (Object.keys(filtered).length > 0) return;

    mutation.mutate(
      {
        empNo: values.empNo.trim(),
        name: values.name.trim(),
        nickname: values.nickname.trim(),
        email: values.email.trim(),
        birthday: values.birthday,
        hp: normalizePhone(values.hp),
        tel: normalizePhone(values.tel),
        joinAt: values.joinAt,
      },
      { onSuccess: () => toast.success("회원 정보를 저장했습니다.") },
    );
  };

  const fieldProps = (key: keyof Values) => ({
    id: `user-${key}`,
    name: key,
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((prev) => ({ ...prev, [key]: e.target.value })),
    "aria-invalid": !!errors[key],
    "aria-describedby": `user-${key}-message`,
  });

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      {/* 사번·이메일 중복 등 서버 검증 오류 */}
      <FormError message={mutation.error ? getErrorMessage(mutation.error) : null} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="user-empNo" label="사번" required error={errors.empNo} hint="로그인 아이디로 사용됩니다.">
          <Input {...fieldProps("empNo")} autoComplete="off" />
        </FormField>
        <FormField
          id="user-joinAt"
          label="입사일"
          required={isApproved}
          error={errors.joinAt}
          hint={isApproved ? undefined : "가입 승인 전에 먼저 등록해야 합니다."}
        >
          <Input {...fieldProps("joinAt")} type="date" />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="user-name" label="이름" required error={errors.name}>
          <Input {...fieldProps("name")} autoComplete="off" />
        </FormField>
        <FormField id="user-nickname" label="닉네임" error={errors.nickname}>
          <Input {...fieldProps("nickname")} autoComplete="off" />
        </FormField>
      </div>

      <FormField id="user-email" label="이메일" required error={errors.email}>
        <Input {...fieldProps("email")} type="email" autoComplete="off" />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="user-birthday" label="생년월일" error={errors.birthday}>
          <Input {...fieldProps("birthday")} type="date" />
        </FormField>
        <FormField id="user-hp" label="휴대폰" error={errors.hp}>
          <Input {...fieldProps("hp")} type="tel" inputMode="numeric" autoComplete="off" />
        </FormField>
        <FormField id="user-tel" label="전화" error={errors.tel}>
          <Input {...fieldProps("tel")} type="tel" inputMode="numeric" autoComplete="off" />
        </FormField>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
          저장
        </Button>
      </div>
    </form>
  );
}
