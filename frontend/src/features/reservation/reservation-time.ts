// 시설 예약 화면의 날짜·시각 계산 (모두 KST 기준)
// - 날짜는 "YYYY-MM-DD" 문자열, 시각은 그날 00:00부터의 분(minute)으로 다룬다. (분류 규칙과 같은 단위)
// - 서버로 보낼 때는 "+09:00"이 붙은 ISO 문자열로 만든다. 브라우저 시간대와 관계없이 같은 값이 된다.
// - 서버 응답(UTC ISO)을 표시할 때는 lib/format의 toKstParts를 쓴다.
import { toKstParts } from "@/lib/format";
import { WEEKDAY_LABEL, type ReservationRules } from "@/types/reservation";

const DAY_MS = 24 * 60 * 60 * 1000;

// "YYYY-MM-DD"를 UTC 자정의 Date로 (날짜 계산 전용 - 시간대 영향 없이 일 단위로 더하고 빼기 위함)
const toUtcDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromUtcDate = (d: Date) => d.toISOString().slice(0, 10);

export function kstToday() {
  return toKstParts(new Date().toISOString()).date;
}

export function addDays(date: string, days: number) {
  return fromUtcDate(new Date(toUtcDate(date).getTime() + days * DAY_MS));
}

// ISO 요일 (1 = 월 … 7 = 일)
export function weekdayOf(date: string) {
  const day = toUtcDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

// 그 주의 월요일
export function weekStart(date: string) {
  return addDays(date, 1 - weekdayOf(date));
}

// "11/12(목)"
export function formatShortDate(date: string) {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}(${WEEKDAY_LABEL[weekdayOf(date)]})`;
}

// 분 → "HH:mm" (1440 → "24:00")
export function formatHm(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

// "HH:mm" → 분 (형식이 틀리면 null)
export function parseHm(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute <= 1440 ? minute : null;
}

// KST 날짜 + 분 → 서버로 보낼 ISO 문자열 ("2026-11-12T10:00:00+09:00", 24:00은 다음 날 00:00)
export function kstIso(date: string, minute: number) {
  if (minute >= 1440) return kstIso(addDays(date, Math.floor(minute / 1440)), minute % 1440);
  return `${date}T${formatHm(minute)}:00+09:00`;
}

// 서버 시각(ISO)이 date의 00:00 KST부터 몇 분 뒤인지 (그날 밖이면 음수 또는 1440 이상)
export function minutesFromDayStart(iso: string, date: string) {
  return (Date.parse(iso) - Date.parse(kstIso(date, 0))) / 60000;
}

// 서버 시각 범위 표기 - "2026-11-12(목) 10:00~11:00"
export function formatReservationRange(startIso: string, endIso: string) {
  const start = toKstParts(startIso);
  const endMinute = minutesFromDayStart(endIso, start.date);
  return `${start.date}(${WEEKDAY_LABEL[weekdayOf(start.date)]}) ${start.time}~${formatHm(endMinute)}`;
}

// 서버 시각 → { date, minute } (KST)
export function toDateMinute(iso: string) {
  const { date } = toKstParts(iso);
  return { date, minute: minutesFromDayStart(iso, date) };
}

// 예약할 수 있는 마지막 날짜 (오늘 + maxAdvanceDays)
export function lastBookableDate(rules: Pick<ReservationRules, "maxAdvanceDays">) {
  return addDays(kstToday(), rules.maxAdvanceDays);
}

// 시작 시각 선택지: 운영 시작부터 단위마다, 마지막 칸의 시작까지
export function startOptions(rules: ReservationRules) {
  const options: number[] = [];
  for (let m = rules.openMinute; m + rules.slotMinutes <= rules.closeMinute; m += rules.slotMinutes) options.push(m);
  return options;
}

// 종료 시각 선택지: 시작 다음 칸부터 운영 종료까지
export function endOptions(rules: ReservationRules, startMinute: number) {
  const options: number[] = [];
  for (let m = startMinute + rules.slotMinutes; m <= rules.closeMinute; m += rules.slotMinutes) options.push(m);
  return options;
}

// 예약 단위마다의 시각 (00:00부터) - 사용 불가 기간 입력 선택지 (시간이 애매하게 들어가지 않게)
// 종료 선택지는 하루 끝(24:00 = 다음 날 00:00)까지 넣는다.
export function slotTimes(slotMinutes: number, includeEndOfDay = false) {
  const times: number[] = [];
  for (let m = 0; m < 1440; m += slotMinutes) times.push(m);
  if (includeEndOfDay) times.push(1440);
  return times;
}

// 지금 이후에 시작하는 칸인지 (서버의 "시작 시각 <= 지금이면 지난 예약" 기준과 같다)
export function isFutureSlot(date: string, minute: number) {
  return Date.parse(kstIso(date, minute)) > Date.now();
}

// 서버 시각이 이미 지났는지 (예약 시작 전/후 판단)
export function hasStarted(iso: string) {
  return Date.parse(iso) <= Date.now();
}
