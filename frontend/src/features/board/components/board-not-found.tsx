import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

// 서버가 404를 준 경우 (없음, 삭제됨, 읽기 권한 없음 - 서버는 권한이 없어도 존재 여부를 알려 주지 않는다)
export function NotFoundMessage({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-5" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{description}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link href={href}>{linkLabel}</Link>
      </Button>
    </div>
  );
}

export function BoardNotFound() {
  return (
    <NotFoundMessage
      title="게시판을 찾을 수 없습니다"
      description="삭제되었거나 볼 수 있는 권한이 없는 게시판입니다."
      href="/"
      linkLabel="대시보드로 이동"
    />
  );
}

export function PostNotFound({ boardId }: { boardId: number }) {
  return (
    <NotFoundMessage
      title="게시글을 찾을 수 없습니다"
      description="삭제되었거나 볼 수 있는 권한이 없는 게시글입니다."
      href={`/boards/${boardId}`}
      linkLabel="목록으로"
    />
  );
}
