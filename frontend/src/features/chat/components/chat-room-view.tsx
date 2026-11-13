"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-message";
import { useAuth } from "@/providers/auth-provider";
import {
  CHAT_GROUP_NAME_MAX_LENGTH,
  leaveChatRoom,
  renameChatRoom,
  setMyChatRoomName,
  type ChatRoomDetail,
} from "@/services/api/chats";
import { roomTitle, userMeta } from "../chat-display";
import { useChatFileUpload } from "../hooks/use-chat-file-upload";
import { chatKeys, useChatRoom } from "../hooks/use-chats";
import { ChatComposer } from "./chat-composer";
import { ChatMessageList } from "./chat-message-list";
import { ChatRoomFilesPanel } from "./chat-room-files";
import { ChatInvitePanel, ChatMembersPanel } from "./chat-room-members";
import { ChatPanelHeader } from "./chat-window";
import { useChat } from "./chat-provider";

type Panel = "chat" | "members" | "invite" | "files";
type NameDialog = "room" | "mine" | null;

// 채팅방 화면: 대화 + 입력, 메뉴(참여자·초대·이름·나가기)
// 참여자·초대 화면으로 바꿔도 대화와 입력란은 숨기기만 해서 입력 중인 글이 남는다.
export function ChatRoomView({ roomId }: { roomId: number }) {
  const { showList } = useChat();
  const { user } = useAuth();
  const { data: room, isPending, isError, error, refetch } = useChatRoom(roomId);
  const [panel, setPanel] = useState<Panel>("chat");
  const [nameDialog, setNameDialog] = useState<NameDialog>(null);
  const [leaving, setLeaving] = useState(false);
  const upload = useChatFileUpload(roomId);
  const [dragging, setDragging] = useState(false);

  if (isPending || !user) {
    return (
      <>
        <ChatPanelHeader title="채팅" onBack={showList} />
        <LoadingState />
      </>
    );
  }

  // 나갔거나 내보내진 방, 없는 방 (서버 404)
  if (isError) {
    return (
      <>
        <ChatPanelHeader title="채팅" onBack={showList} />
        <div className="p-4">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      </>
    );
  }

  const isGroup = room.type === "GROUP";
  const subtitle = isGroup ? `${room.members.length}명` : room.otherUser ? userMeta(room.otherUser) : undefined;

  return (
    <>
      {panel === "members" && <ChatMembersPanel room={room} userId={user.id} onBack={() => setPanel("chat")} />}
      {panel === "invite" && <ChatInvitePanel room={room} onDone={() => setPanel("chat")} />}
      {panel === "files" && <ChatRoomFilesPanel room={room} onBack={() => setPanel("chat")} />}

      <div className={panel === "chat" ? "contents" : "hidden"}>
        <ChatPanelHeader
          title={roomTitle(room)}
          subtitle={subtitle}
          onBack={showList}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="채팅방 메뉴">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => setPanel("members")}>참여자 보기</DropdownMenuItem>
                {isGroup && <DropdownMenuItem onSelect={() => setPanel("invite")}>대화 상대 초대</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setPanel("files")}>파일 보관함</DropdownMenuItem>
                <DropdownMenuSeparator />
                {isGroup && room.myRole === "OWNER" && (
                  <DropdownMenuItem onSelect={() => setNameDialog("room")}>방 이름 변경</DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setNameDialog("mine")}>나만 보는 이름</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setLeaving(true)}>
                  나가기
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
        {/* 파일 끌어다 놓기 (대화·입력란 영역). 읽기 전용 방이거나 보내는 중이면 받지 않는다 */}
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          onDragOver={(e) => {
            if (room.readOnly || upload.progress || !e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            if (!dragging) return;
            e.preventDefault();
            setDragging(false);
            void upload.upload(Array.from(e.dataTransfer.files));
          }}
        >
          <ChatMessageList room={room} userId={user.id} />
          <ChatComposer roomId={room.id} readOnly={room.readOnly} upload={upload} />
          {dragging && (
            <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-background/90 text-sm text-muted-foreground">
              여기에 놓으면 보냅니다 (최대 10개)
            </div>
          )}
        </div>
      </div>

      {nameDialog && <RoomNameDialog room={room} kind={nameDialog} onClose={() => setNameDialog(null)} />}
      {leaving && <LeaveDialog room={room} userId={user.id} onClose={() => setLeaving(false)} onLeft={showList} />}
    </>
  );
}

// 방 이름 (2026-11-13 사용자 결정)
// - 기본 이름(room): 그룹 방장만, 모두에게 보이고 시스템 메시지가 남는다.
// - 나만 보는 이름(mine): 누구나, 나에게만 보인다. 비우면 기본 이름으로 돌아간다.
function RoomNameDialog({ room, kind, onClose }: { room: ChatRoomDetail; kind: "room" | "mine"; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState((kind === "room" ? room.name : room.myName) ?? "");
  const trimmed = value.trim();

  const save = useMutation({
    mutationFn: async () => {
      if (kind === "room") return renameChatRoom(room.id, trimmed);
      await setMyChatRoomName(room.id, trimmed || null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.room(room.id) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const canSave = (kind === "mine" || trimmed.length > 0) && !save.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{kind === "room" ? "방 이름 변경" : "나만 보는 이름"}</DialogTitle>
            <DialogDescription>
              {kind === "room"
                ? "모든 참여자에게 보이는 이름입니다."
                : "나에게만 보이는 이름입니다. 비우면 원래 이름으로 돌아갑니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="chat-room-name">이름</Label>
            <Input
              id="chat-room-name"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={CHAT_GROUP_NAME_MAX_LENGTH}
              placeholder={kind === "mine" ? (room.name ?? room.otherUser?.name ?? "") : undefined}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              취소
            </Button>
            <Button type="submit" disabled={!canSave}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// 나가기 (features.md 8.3)
// - 1:1: 내 목록에서 숨기기. 상대가 다시 보내면 같은 방이 다시 나타난다(나간 뒤 기록은 보이지 않음).
// - 그룹 방장: 다음 방장을 고를 수 있고, 고르지 않으면 가장 오래 참여한 사람이 맡는다.
function LeaveDialog({
  room,
  userId,
  onClose,
  onLeft,
}: {
  room: ChatRoomDetail;
  userId: number;
  onClose: () => void;
  onLeft: () => void;
}) {
  const queryClient = useQueryClient();
  const others = room.members.filter((m) => m.id !== userId);
  const choosesOwner = room.type === "GROUP" && room.myRole === "OWNER" && others.length > 0;
  const [nextOwnerId, setNextOwnerId] = useState<number | "">("");

  const leave = useMutation({
    mutationFn: () => leaveChatRoom(room.id, nextOwnerId === "" ? undefined : nextOwnerId),
    onSuccess: () => {
      onLeft(); // 먼저 목록으로 바꾼다. 방 화면이 남은 채로 캐시를 지우면 다시 조회해서 404가 난다.
      queryClient.removeQueries({ queryKey: chatKeys.room(room.id) });
      queryClient.removeQueries({ queryKey: chatKeys.messages(room.id) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
      void queryClient.invalidateQueries({ queryKey: chatKeys.unreadTotal() });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !leave.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>채팅방을 나갈까요?</DialogTitle>
          <DialogDescription>
            {room.type === "DIRECT"
              ? "내 목록에서 사라집니다. 상대가 메시지를 보내면 다시 나타나고, 지금까지의 대화는 보이지 않습니다."
              : "다시 초대받기 전까지 이 채팅방의 대화를 볼 수 없습니다."}
          </DialogDescription>
        </DialogHeader>
        {choosesOwner && (
          <div className="grid gap-2">
            <Label htmlFor="chat-next-owner">다음 방장</Label>
            <select
              id="chat-next-owner"
              value={nextOwnerId}
              onChange={(e) => setNextOwnerId(e.target.value === "" ? "" : Number(e.target.value))}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">자동 (가장 오래 참여한 사람)</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={leave.isPending}>
            취소
          </Button>
          <Button variant="destructive" onClick={() => leave.mutate()} disabled={leave.isPending}>
            {leave.isPending && <Loader2 className="animate-spin" aria-hidden />}
            나가기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
