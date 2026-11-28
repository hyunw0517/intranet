"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// 회원 프로필 사진 (원형, 없거나 못 불러오면 이름 첫 글자)
// imageUrl은 썸네일 공개 주소라 <img>로 바로 쓴다.
export function UserAvatar({
  name,
  imageUrl,
  className,
  fallbackClassName,
}: {
  name: string;
  imageUrl: string | null | undefined;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={className}>
      {imageUrl && <AvatarImage src={imageUrl} alt={`${name} 프로필 사진`} />}
      <AvatarFallback className={cn("text-xs", fallbackClassName)}>{name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
}
