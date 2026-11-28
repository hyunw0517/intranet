"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { checkUploadFile, IMAGE_EXTENSIONS, MAX_IMAGE_SIZE, uploadImage } from "@/services/api/files";
import { deleteMyProfileImage, setMyProfileImage } from "@/services/api/users";
import { useAuth } from "@/providers/auth-provider";
import type { CurrentUser } from "@/types/user";

// 프로필 사진 등록·변경·삭제
// 파일 선택 → 확장자·용량 검사 → 이미지 업로드 → 연결(PUT /users/me/profile-image)
// 승인 대기(GUEST)는 업로드 API가 막혀 있어(USER 이상) 안내만 보여 준다.
export function ProfileImageField({ user }: { user: CurrentUser }) {
  const { setUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEdit = user.role !== "GUEST";

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadImage(file);
      return setMyProfileImage(uploaded.id);
    },
    onSuccess: (updated) => {
      setUser(updated);
      toast.success("프로필 사진을 저장했습니다.");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: deleteMyProfileImage,
    onSuccess: (updated) => {
      setUser(updated);
      setConfirmDelete(false);
      toast.success("프로필 사진을 삭제했습니다.");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 골라도 change가 나도록
    if (!file) return;

    const error = checkUploadFile(file, IMAGE_EXTENSIONS, MAX_IMAGE_SIZE);
    if (error) {
      toast.error(error);
      return;
    }
    upload.mutate(file);
  };

  const pending = upload.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <UserAvatar name={user.name} imageUrl={user.profileImageUrl} className="size-20" fallbackClassName="text-2xl" />
      <div className="grid gap-2">
        {canEdit ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>
                {upload.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {user.profileImageUrl ? "사진 변경" : "사진 등록"}
              </Button>
              {user.profileImageUrl && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={pending}>
                  삭제
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              업로드 제한: {Math.round(MAX_IMAGE_SIZE / 1024 / 1024)}MB 이하 png·jpg·gif·webp 파일
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={IMAGE_EXTENSIONS.join(",")}
              className="hidden"
              onChange={handleChange}
              aria-label="프로필 사진 파일 선택"
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">관리자 승인 후 프로필 사진을 등록할 수 있습니다.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="프로필 사진을 삭제할까요?"
        description="삭제하면 이름 첫 글자가 대신 표시됩니다."
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
