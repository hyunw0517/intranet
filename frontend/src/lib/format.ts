// 날짜 표기 공통 규칙: yyyy-MM-dd (값이 없으면 "-")
// 백엔드는 ISO 문자열로 응답하므로 앞 10자리만 사용한다. (DATE 컬럼은 시간대 변환 없이 그대로)
export function formatDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "-";
}

// <input type="date">에 넣을 값 (값이 없으면 빈 문자열)
export function toDateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}
