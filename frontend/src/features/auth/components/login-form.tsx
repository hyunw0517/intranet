"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-message";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/services/api-client";
import { FindAccountDialog } from "./find-account-dialog";

interface FieldErrors {
  empNo?: string;
  password?: string;
}

// 로그인 성공 후 이동은 GuestOnlyGate가 처리한다. (status가 authenticated로 바뀌면 ?next= 경로로 이동)
export function LoginForm() {
  const { login } = useAuth();
  const [empNo, setEmpNo] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const mutation = useMutation({
    mutationFn: () => login(empNo.trim(), password),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (!empNo.trim()) errors.empNo = "사번을 입력해 주세요.";
    if (!password) errors.password = "비밀번호를 입력해 주세요.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    mutation.mutate();
  };

  // 401은 원인(없는 사번 / 틀린 비밀번호)을 구분하지 않는다. 구분하면 등록된 사번을 알아내는 데 쓰일 수 있다.
  // 403(비활성·퇴사 계정)은 서버 메시지를 그대로 보여 준다.
  const serverError = mutation.error
    ? mutation.error instanceof ApiError && mutation.error.status === 401
      ? "사번 또는 비밀번호가 올바르지 않습니다."
      : getErrorMessage(mutation.error)
    : null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">로그인</h1>
        <p className="text-muted-foreground">사번과 비밀번호를 입력해 주세요.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
        <FormError message={serverError} />

        <FormField id="empNo" label="사번" error={fieldErrors.empNo}>
          <Input
            id="empNo"
            name="empNo"
            autoComplete="username"
            autoFocus
            value={empNo}
            onChange={(e) => setEmpNo(e.target.value)}
            aria-invalid={!!fieldErrors.empNo}
            aria-describedby={fieldErrors.empNo ? "empNo-message" : undefined}
          />
        </FormField>

        <FormField id="password" label="비밀번호" error={fieldErrors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? "password-message" : undefined}
          />
        </FormField>

        <Button type="submit" className="mt-2 w-full" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
          로그인
        </Button>
      </form>

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <FindAccountDialog />
        <Button asChild variant="outline" size="sm">
          <Link href="/register">회원가입</Link>
        </Button>
      </div>
    </div>
  );
}
