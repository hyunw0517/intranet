"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// 회원 프로필 사진 (원형) - 사진이 없거나 불러오지 못하면 이름 첫 글자
// imageUrl은 서버가 주는 썸네일 공개 주소(/api/common/files/thumbnails/...)라 <img>로 바로 쓴다.
// 사용처: 헤더 사용자 메뉴, 마이페이지, 채팅(방 목록·참여자·메시지)
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
