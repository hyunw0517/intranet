// 날짜 표기 공통 규칙: yyyy-MM-dd (값이 없으면 "-")
// 백엔드는 ISO 문자열로 응답하므로 앞 10자리만 사용한다. (DATE 컬럼은 시간대 변환 없이 그대로)
export function formatDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "-";
}

// <input type="date">에 넣을 값 (값이 없으면 빈 문자열)
export function toDateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

// ── 시각(timestamp) 표기: 서버는 UTC ISO 문자열로 응답하므로 KST로 바꿔 표시한다. ──
// 위 formatDate(앞 10자리)는 DATE 컬럼용이다. 시각에 쓰면 KST 00~09시가 전날로 보인다.

const KST_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// ISO 문자열 → KST 기준 { date: "yyyy-MM-dd", time: "HH:mm" }
export function toKstParts(value: string) {
  const parts = Object.fromEntries(KST_PARTS.formatToParts(new Date(value)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// yyyy-MM-dd HH:mm (KST)
export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const { date, time } = toKstParts(value);
  return `${date} ${time}`;
}

// 목록용: 오늘 쓴 글은 HH:mm, 그 외는 yyyy-MM-dd (KST)
export function formatListDate(value: string) {
  const { date, time } = toKstParts(value);
  return date === toKstParts(new Date().toISOString()).date ? time : date;
}

// 파일 크기 (1,024 단위, 소수 한 자리)
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
