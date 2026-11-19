"use client";

import { UserProfileContent } from "@/components/common/user-profile-content";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StartChatButton } from "@/features/chat/components/start-chat-button";
import type { DirectoryUser } from "@/services/api/org-chart";

// 사원 상세 - 목록 응답(DirectoryUser)을 그대로 보여 준다(별도 조회 없음)
export function DirectoryUserDialog({ user, onClose }: { user: DirectoryUser | null; onClose: () => void }) {
  return (
    <Dialog open={user !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {user && <UserProfileContent user={user} actions={<StartChatButton userId={user.id} onOpened={onClose} />} />}
      </DialogContent>
    </Dialog>
  );
}
