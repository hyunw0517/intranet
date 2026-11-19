"use client";

import { Mail, Phone } from "lucide-react";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StartChatButton } from "@/features/chat/components/start-chat-button";
import type { DirectoryUser } from "@/services/api/org-chart";

// 사원 상세 - 목록 응답(DirectoryUser)을 그대로 보여 준다(별도 조회 없음)
// 공개 범위: 사진·소속 전체·직급·직책·이메일·회사 전화 (휴대폰·생일은 서버가 내보내지 않는다)
export function DirectoryUserDialog({ user, onClose }: { user: DirectoryUser | null; onClose: () => void }) {
  return (
    <Dialog open={user !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {user && (
          <>
            <DialogHeader className="items-center text-center sm:items-center sm:text-center">
              <UserAvatar name={user.name} imageUrl={user.profileImageUrl} className="size-24" fallbackClassName="text-3xl" />
              <DialogTitle className="mt-2">
                {user.name}
                {user.positionName && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{user.positionName}</span>}
              </DialogTitle>
              <DialogDescription>사번 {user.empNo}</DialogDescription>
            </DialogHeader>

            <dl className="grid gap-4 text-sm">
              <div className="grid gap-1.5">
                <dt className="text-muted-foreground">소속</dt>
                <dd>
                  {user.departments.length === 0 ? (
                    <span className="text-muted-foreground">소속 없음</span>
                  ) : (
                    <ul className="grid gap-1">
                      {user.departments.map((d) => (
                        <li key={d.departmentId} className="flex flex-wrap items-center gap-1.5">
                          <span>{d.departmentName}</span>
                          {d.jobTitleName && <span className="text-muted-foreground">· {d.jobTitleName}</span>}
                          {!d.isPrimary && <Badge variant="outline">겸직</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
              <div className="grid gap-1.5">
                <dt className="text-muted-foreground">연락처</dt>
                <dd className="grid gap-1">
                  <a href={`mailto:${user.email}`} className="flex items-center gap-2 break-all hover:underline">
                    <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {user.email}
                  </a>
                  {user.tel ? (
                    <a href={`tel:${user.tel}`} className="flex items-center gap-2 tabular-nums hover:underline">
                      <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      {user.tel}
                    </a>
                  ) : (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-4 shrink-0" aria-hidden />
                      등록된 전화번호 없음
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="flex justify-end">
              <StartChatButton userId={user.id} onOpened={onClose} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
