// 게시글 본문 표시 (Server/Client 어디서든 쓸 수 있는 순수 표시 컴포넌트)
// 본문은 저장할 때 서버(sanitize-html 허용 목록)에서 이미 정제되었다. 그래서 받은 HTML을 그대로 넣는다.
// 프론트 정제를 따로 두지 않은 이유: 에디터를 거치지 않는 API 직접 호출도 서버에서 막히므로, 저장 시점 한 곳에서 지킨다.
export function RichTextContent({ html }: { html: string | null }) {
  if (!html) return <p className="text-muted-foreground">내용이 없습니다.</p>;
  return <div className="rich-text" dangerouslySetInnerHTML={{ __html: html }} />;
}
