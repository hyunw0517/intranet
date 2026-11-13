"use client";

import { AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "./confirm-dialog";

// 파일 내려받기 전 확인 + 보안 경고 (채팅·게시판 공용, 2026-11-14 사용자 요청 - 보안 차원)
// - 문구·모양을 한곳에서 관리한다. 경고 박스는 시설 사용 불가 기간 창의 경고와 같은 주의 색(amber) + 경고 아이콘
// - 누르는 버튼 "안"에 두지 않는다. portal로 그려져도 React 이벤트가 React 트리를 따라 바깥 버튼의 onClick까지
//   올라가서, [다운로드]를 누를 때 창이 다시 열린다. (부르는 쪽에서 버튼 옆·목록 밖에 둔다)
// - 닫기는 부르는 쪽이 받기가 끝난 뒤 onOpenChange(false)로 한다. 받는 동안(pending)은 닫히지 않는다.
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
