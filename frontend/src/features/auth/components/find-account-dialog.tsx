"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// 아이디·비밀번호 찾기 안내
// 백엔드에 찾기·메일 재설정 기능이 없으므로 안내만 한다. (메일 재설정은 추후 개선 - Plan.md)
export function FindAccountDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="link" className="h-auto p-0 text-muted-foreground">
          아이디·비밀번호를 잊으셨나요?
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>아이디·비밀번호 찾기</DialogTitle>
          <DialogDescription>온라인 찾기 기능은 준비 중입니다. 아래 방법으로 문의해 주세요.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-4">
          <div>
            <dt className="font-medium">아이디(사번)</dt>
            <dd className="mt-1 text-muted-foreground">로그인 아이디는 사번입니다. 사번을 모르면 인사 담당자에게 문의하세요.</dd>
          </div>
          <div>
            <dt className="font-medium">비밀번호</dt>
            <dd className="mt-1 text-muted-foreground">
              관리자에게 비밀번호 초기화를 요청하세요. 발급받은 임시 비밀번호로 로그인한 뒤 마이페이지에서 변경할 수 있습니다.
            </dd>
          </div>
        </dl>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              확인
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
