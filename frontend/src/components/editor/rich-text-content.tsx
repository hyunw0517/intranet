// 에디터 본문 표시 (게시글·결재 문서·프로젝트 설명 공용)
// 본문은 저장할 때 서버에서 허용 목록으로 정제돼서 받은 HTML을 그대로 넣는다.
// API 직접 호출도 서버에서 막히므로 프론트에 따로 정제를 두지 않았다.
export function RichTextContent({ html }: { html: string | null }) {
  if (!html) return <p className="text-muted-foreground">내용이 없습니다.</p>;
  return <div className="rich-text" dangerouslySetInnerHTML={{ __html: html }} />;
}
