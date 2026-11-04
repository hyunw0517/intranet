import { toKstParts } from "@/lib/format";

// 캘린더 게시글 일정 입력값 ↔ API 값 변환
// 입력(<input type="date|datetime-local">)은 시간대가 없는 값이므로 KST(+09:00)로 고정해 보낸다.
// 브라우저 시간대와 관계없이 사내 기준 시각으로 저장·표시하기 위함이다. (서버의 종일 처리도 KST 기준)

const KST_OFFSET = "+09:00";

export interface EventInput {
  isAllDay: boolean;
  startDate: string; // yyyy-MM-dd
  startTime: string; // HH:mm (종일이면 사용하지 않음)
  endDate: string;
  endTime: string;
}

export const EMPTY_EVENT: EventInput = { isAllDay: false, startDate: "", startTime: "09:00", endDate: "", endTime: "10:00" };

// 상세 응답 → 입력값 (수정 화면)
export function toEventInput(start: string | null, end: string | null, isAllDay: boolean | null): EventInput {
  if (!start || !end) return EMPTY_EVENT;
  const s = toKstParts(start);
  const e = toKstParts(end);
  return { isAllDay: !!isAllDay, startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time };
}

// 입력값 → API 값. 날짜가 비었으면 null (서버가 "시작·종료를 입력하세요" 400)
// 종일이면 시간은 00:00으로 보내고 서버가 그날 00:00:00~23:59:59로 맞춘다.
export function toEventPayload(input: EventInput) {
  const at = (date: string, time: string) => (date ? `${date}T${input.isAllDay ? "00:00" : time}:00${KST_OFFSET}` : null);
  return {
    eventStartAt: at(input.startDate, input.startTime),
    eventEndAt: at(input.endDate, input.endTime),
    isAllDay: input.isAllDay,
  };
}

// 화면 검증 (서버도 같은 규칙으로 다시 검사한다)
export function validateEvent(input: EventInput): string | null {
  if (!input.startDate || !input.endDate) return "일정의 시작일과 종료일을 입력하세요.";
  if (!input.isAllDay && (!input.startTime || !input.endTime)) return "일정의 시작 시간과 종료 시간을 입력하세요.";
  const { eventStartAt, eventEndAt } = toEventPayload(input);
  // 종일이면 날짜만 비교 (같은 날이면 정상)
  if (new Date(eventEndAt!) < new Date(eventStartAt!)) return "종료일시는 시작일시보다 빠를 수 없습니다.";
  return null;
}

// 상세 화면 표시: 종일이면 날짜만, 같은 날이면 끝 시간만
export function formatEventRange(start: string, end: string, isAllDay: boolean | null) {
  const s = toKstParts(start);
  const e = toKstParts(end);
  if (isAllDay) return s.date === e.date ? `${s.date} (종일)` : `${s.date} ~ ${e.date} (종일)`;
  if (s.date === e.date) return `${s.date} ${s.time} ~ ${e.time}`;
  return `${s.date} ${s.time} ~ ${e.date} ${e.time}`;
}
