// 대화 내용 복사 형식
// 2026년 11월 19일 목요일      ← 날짜 구분선
// [홍길동] [오후 2:05]
// 메시지 본문 (줄바꿈 유지)
// 두 번째 메시지 본문          ← 같은 사람이 같은 분에 이어 보낸 메시지는 이름·시각을 한 번만 쓴다
import type { ChatMessage } from "@/services/api/chats";
import { copyDateLabel, messageDate, messageTime12h } from "./chat-display";

// 화면 요소에 붙이는 표식 (chat-message-list.tsx, 시스템 메시지는 표식이 없어 복사되지 않는다)
// - data-copy-date: 날짜 구분선 / data-copy-message: 메시지 한 건 / data-copy-body: 그 안의 글자 말풍선
const COPY_ITEMS = "[data-copy-date], [data-copy-message]";

// 선택 범위를 복사할 글자로 바꾼다 (null이면 브라우저 기본 복사).
// 메시지 하나의 일부만 골랐으면 기본 복사, 그 밖에는 걸친 메시지 본문 전체를 위 형식으로 만든다.
export function buildChatCopyText(container: HTMLElement, selection: Selection, messages: ChatMessage[]) {
  const range = selection.getRangeAt(0);
  const byId = new Map(messages.map((message) => [message.id, message]));
  const lines: string[] = [];
  let selectedCount = 0;
  let partialText = false;
  let lastGroup: string | null = null;

  container.querySelectorAll<HTMLElement>(COPY_ITEMS).forEach((el) => {
    const { copyDate, copyMessage } = el.dataset;
    if (copyDate) {
      if (!selectedTextIn(el, range).trim()) return;
      selectedCount += 1;
      lines.push(copyDateLabel(copyDate));
      return;
    }

    const message = byId.get(Number(copyMessage));
    if (!message) return;
    const body = el.querySelector<HTMLElement>("[data-copy-body]");
    // 파일은 고를 글자가 없어 범위 안에 통째로 들어온 경우만 포함한다.
    const selected = body ? selectedTextIn(body, range).trim() : "";
    if (body ? !selected : !containsNode(range, el)) return;

    selectedCount += 1;
    partialText = message.type === "TEXT" && !message.deleted && selected !== body?.textContent?.trim();

    // 보낸 사람을 알 수 없는 메시지는 같은 사람인지 모르므로 묶지 않는다.
    const time = messageTime12h(message.createdAt);
    const group = message.sender ? `${message.sender.id}|${messageDate(message.createdAt)}|${time}` : null;
    if (group === null || group !== lastGroup) lines.push(`[${message.sender?.name ?? "(알 수 없음)"}] [${time}]`);
    lines.push(copyBody(message));
    lastGroup = group;
  });

  if (selectedCount === 0 || (selectedCount === 1 && partialText)) return null;
  return lines.join("\n");
}

// 메시지 본문: 글자는 그대로, 삭제·파일은 정해진 문구
function copyBody(message: ChatMessage) {
  if (message.deleted) return "[삭제된 메시지]";
  if (message.type !== "FILE") return message.content ?? "";
  const kind = message.files[0]?.kind;
  if (kind === "image") return "[이미지]";
  if (kind === "video") return "[동영상]";
  return "[파일]";
}

// 요소 안에서 실제로 선택된 글자 (세 번 클릭하면 범위 끝이 다음 요소의 시작에 걸리므로 교집합으로 판단한다)
function selectedTextIn(el: HTMLElement, range: Range) {
  const part = document.createRange();
  part.selectNodeContents(el);
  if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
  return part.toString();
}

function containsNode(range: Range, el: HTMLElement) {
  const part = document.createRange();
  part.selectNodeContents(el);
  return range.compareBoundaryPoints(Range.START_TO_START, part) <= 0 && range.compareBoundaryPoints(Range.END_TO_END, part) >= 0;
}
