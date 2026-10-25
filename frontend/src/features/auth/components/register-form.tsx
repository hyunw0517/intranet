"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-message";
import { useAuth } from "@/providers/auth-provider";
import {
  normalizePhone,
  validateEmail,
  validateName,
  validateNewPassword,
  validateNickname,
  validatePasswordConfirm,
  validatePhone,
} from "@/lib/validation/user";

const INITIAL = {
  empNo: "",
  name: "",
  email: "",
  password: "",
  passwordConfirm: "",
  nickname: "",
  birthday: "",
  hp: "",
  tel: "",
};

type Values = typeof INITIAL;
type Errors = Partial<Record<keyof Values, string>>;

function validate(v: Values): Errors {
  const errors: Errors = {
    empNo: v.empNo.trim() ? undefined : "사번을 입력해 주세요.",
    name: validateName(v.name),
    email: validateEmail(v.email),
    password: validateNewPassword(v.password),
    passwordConfirm: validatePasswordConfirm(v.password, v.passwordConfirm),
    nickname: validateNickname(v.nickname),
    hp: validatePhone(v.hp),
    tel: validatePhone(v.tel),
  };
  return Object.fromEntries(Object.entries(errors).filter(([, msg]) => msg)) as Errors;
}

// 본인 가입 → 즉시 GUEST로 로그인 → 관리자가 승인하면 USER
// 가입 성공 후 이동은 GuestOnlyGate가 처리한다. (/ 로 이동 → PendingApprovalGate가 승인 대기 화면 표시)
export function RegisterForm() {
  const { register } = useAuth();
  const [values, setValues] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});

  const mutation = useMutation({
    mutationFn: () =>
      register({
        empNo: values.empNo.trim(),
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        // 선택 항목은 비어 있으면 보내지 않는다.
        nickname: values.nickname.trim() || undefined,
        birthday: values.birthday || undefined,
        hp: normalizePhone(values.hp) || undefined,
        tel: normalizePhone(values.tel) || undefined,
      }),
    onSuccess: () => {
      toast.success("가입 신청이 완료되었습니다. 관리자 승인 후 이용할 수 있습니다.");
    },
  });

  const update = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = validate(values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate();
  };

  // 입력 요소에 공통으로 넘기는 접근성 속성
  const fieldProps = (key: keyof Values) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: update(key),
    "aria-invalid": !!errors[key],
    "aria-describedby": `${key}-message`,
  });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">회원가입</h1>
        <p className="text-muted-foreground">가입 후 관리자 승인을 받으면 이용할 수 있습니다.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
        <FormError message={mutation.error ? getErrorMessage(mutation.error) : null} />

        <FormField id="empNo" label="사번" required error={errors.empNo} hint="로그인 아이디로 사용됩니다.">
          <Input {...fieldProps("empNo")} autoComplete="username" autoFocus />
        </FormField>

        <FormField id="name" label="이름" required error={errors.name}>
          <Input {...fieldProps("name")} autoComplete="name" />
        </FormField>

        <FormField id="email" label="이메일" required error={errors.email}>
          <Input {...fieldProps("email")} type="email" autoComplete="email" />
        </FormField>

        <FormField id="password" label="비밀번호" required error={errors.password} hint="8~20자">
          <Input {...fieldProps("password")} type="password" autoComplete="new-password" />
        </FormField>

        <FormField id="passwordConfirm" label="비밀번호 확인" required error={errors.passwordConfirm}>
          <Input {...fieldProps("passwordConfirm")} type="password" autoComplete="new-password" />
        </FormField>

        <fieldset className="grid gap-4 border-t pt-4">
          <legend className="px-1 text-xs text-muted-foreground">선택 입력</legend>

          <FormField id="nickname" label="닉네임" error={errors.nickname}>
            <Input {...fieldProps("nickname")} autoComplete="nickname" />
          </FormField>

          <FormField id="birthday" label="생년월일" error={errors.birthday}>
            <Input {...fieldProps("birthday")} type="date" autoComplete="bday" />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="hp" label="휴대폰" error={errors.hp}>
              <Input {...fieldProps("hp")} type="tel" inputMode="numeric" autoComplete="tel" placeholder="01012345678" />
            </FormField>
            <FormField id="tel" label="전화" error={errors.tel}>
              <Input {...fieldProps("tel")} type="tel" inputMode="numeric" placeholder="0212345678" />
            </FormField>
          </div>
        </fieldset>

        <Button type="submit" className="mt-2 w-full" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
          가입 신청
        </Button>
      </form>

      <p className="text-center text-muted-foreground">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
