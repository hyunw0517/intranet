import { cn } from "@/lib/utils";
import type { PostAuthor as Author } from "@/types/post";

interface PostAuthorProps {
  author: Author | null;
  departmentName: string | null;
  positionName: string | null;
  isAnonymous: boolean;
  className?: string;
}

// 작성자 이름 + 작성 당시 "부서 · 직급" (직책은 응답에 있지만 표시하지 않는다)
// 서버가 가린 작성자(null): 익명 게시판이면 "익명", 그 외(볼 수 없는 비밀글)는 "비공개"
export function PostAuthorLabel({ author, departmentName, positionName, isAnonymous, className }: PostAuthorProps) {
  if (!author) {
    return <span className={cn("text-muted-foreground", className)}>{isAnonymous ? "익명" : "비공개"}</span>;
  }

  const org = [departmentName, positionName].filter(Boolean).join(" · ");
  return (
    <span className={cn("min-w-0", className)}>
      <span className="font-medium text-foreground">{author.name}</span>
      {org && <span className="ml-1.5 text-muted-foreground">{org}</span>}
    </span>
  );
}
