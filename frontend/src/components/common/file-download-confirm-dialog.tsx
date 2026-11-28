"use client";

import { AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "./confirm-dialog";

// 파일 내려받기 전 확인 + 보안 경고 (채팅·게시판 공용)
// 누르는 버튼 안에 두면 portal이어도 React 이벤트가 바깥 버튼 onClick까지 올라가 창이 다시 열린다.
// 그래서 부르는 쪽에서 버튼 옆이나 목록 밖에 둔다.
// 닫기는 받기가 끝난 뒤 부르는 쪽이 한다 (받는 동안은 닫히지 않는다).
export function FileDownloadConfirmDialog({
  fileName,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`"${fileName}" 파일을 다운로드 받으시겠습니까?`}
      description={
        <span className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-left text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <span>출처를 알 수 없는 파일은 악성 코드가 포함되어 있을 수 있습니다.</span>
        </span>
      }
      confirmLabel="다운로드"
      pending={pending}
      onConfirm={onConfirm}
    />
  );
}
