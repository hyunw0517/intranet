"use client";

import { ErrorState, LoadingState } from "@/components/common/data-state";
import { UserProfileContent } from "@/components/common/user-profile-content";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useChatUserProfile } from "../hooks/use-chats";
import { StartChatButton } from "./start-chat-button";

// 메시지 위 사진·이름을 누르면 보낸 사람의 기본 정보
// 채팅 응답에는 이름·사진만 있어서 열 때 조직도 API로 받는다 (재직 중이 아니면 404 안내).
export function ChatUserProfileDialog({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const profile = useChatUserProfile(userId);

  return (
    <Dialog open={userId !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {profile.isPending ? (
          <>
            <DialogTitle className="sr-only">사원 정보</DialogTitle>
            <LoadingState />
          </>
        ) : profile.isError ? (
          <>
            <DialogTitle className="sr-only">사원 정보</DialogTitle>
            <ErrorState error={profile.error} />
          </>
        ) : (
          <UserProfileContent
            user={profile.data}
            // 그룹 방에서 이 사람과 1:1로 이어서 이야기할 때 (1:1 방에서 누르면 지금 방이 다시 열린다)
            actions={<StartChatButton userId={profile.data.id} onOpened={onClose} />}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
