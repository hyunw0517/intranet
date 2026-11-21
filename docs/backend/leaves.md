# 휴가 옵션 백엔드 구조 (`approvals/leaves/`)

> 규칙(사용자 결정)은 [features.md 7.4](../design/features.md) "잔여 연차 관리·차감 시점·휴가 신청 규칙", 연차 계산식은 [leave_calculate_manual.md](../design/leave_calculate_manual.md). 이 문서는 구현 구조(복습용)다.
> 상태: 백엔드 완료(2026-11-12, 미커밋). 화면은 다음 작업.

## 1. 켜는 법

- `backend/.env`의 `ADDONS`에 `approvals,leaves`(결재 없이 휴가만 켜면 서버 시작 오류). `AppModule`의 `addonModule('leaves', LeavesModule)`.
- `LeavesModule`이 `ApprovalsModule`을 import하고, `LeaveDocumentHandler`가 결재의 등록 지점에 `LEAVE` 처리기를 등록한다. 결재 본체는 휴가를 import하지 않는다.

## 2. 파일

| 파일 | 역할 |
|---|---|
| `src/approvals/leaves/leaves.module.ts` | 모듈 (결재의 옵션) |
| `src/approvals/leaves/leave-document.handler.ts` | `LEAVE` 처리기: `directCreate: false`, `onSubmit`·`onFinalApproved` = `assertCanUse`, `onCopy` = 휴가 항목 복사 |
| `src/approvals/leaves/leave-requests.service.ts` | 신청 생성·수정(결재 `createWithData`·`updateWithData`에 `LeaveRequest` 저장 콜백), 조회, ⭐ `assertCanUse`(회원 잠금 + 시간 겹침 + 하루 합계 + 잔여) |
| `src/approvals/leaves/leave-grants.service.ts` | 부여 재계산(월 배치 `@Cron('0 0 0 1 * *', Asia/Seoul)` + 관리자 "지금 재계산"), 관리자 조정, 현황 조회 |
| `src/approvals/leaves/util/leave-grant.calc.ts` | 순수 함수 `calcBaseQuarters(joinAt, year, asOf)` (매뉴얼 3장) |
| `src/approvals/leaves/util/leave-request.util.ts` | 순수 함수: 기간·시각·일수 계산(`buildLeavePeriod`), 시간 겹침(`findTimeConflict`), 하루 합계(`findOverbookedDate`), 제목(`leaveTitle`) |
| `src/approvals/leaves/dto/leave.dto.ts` | 요청 DTO |
| `prisma/schema.prisma` `LeaveGrant` | 마이그레이션 `20261112100000_leave_grant` |

## 3. API

| 메서드 · 경로 | 권한 | 설명 |
|---|---|---|
| `POST /approvals/leaves` | USER | 임시저장(문서 + `LeaveRequest`). 제목은 서버가 만든다. 응답의 `documentId`로 상신 |
| `PATCH /approvals/leaves/documents/:documentId` | USER(기안자, DRAFT) | 임시저장 수정. 휴가 항목은 저장값과 합쳐 다시 계산, 유형(종일↔반차)을 바꾸면 맞지 않는 종료일·시각은 버림 |
| `GET /approvals/leaves/documents/:documentId` | USER(문서 열람 권한) | 문서에 딸린 휴가 정보 + `documentStatus` |
| `GET /approvals/leaves?year=` | USER | 내 신청 목록(삭제 제외, 시작일 최신 순) |
| `GET /approvals/leaves/me?year=` | USER | 내 연차 현황 `{ grantedDays, usedDays, inProgressDays, remainingDays, baseDays, adjustDays, ... }` |
| `GET /approvals/leaves/calendar?start=&end=` | USER(전 직원) | 캘린더 휴가자. 게시판 캘린더와 같은 기간 형식(시간대 있는 ISO, end 미포함), 최대 62일. 최종 승인된 휴가만 날짜별로 `[{ date, count, people: [{ leaveId, userId, name, departmentName, positionName, unit, startTime, endTime }] }]`(count = 그날 사람 수). 휴가 유형은 내보내지 않음. 화면은 캘린더 게시판의 `showLeaves`(게시판 옵션 "휴가자 표시", features.md 5.3)가 켜졌을 때만 부른다 |
| `GET /approvals/leaves/grants?year=&search=&page=&take=` | ADMIN | 연차 현황(부여 행이 있는 회원, 이름 순) |
| `POST /approvals/leaves/grants/recalculate` | ADMIN | 오늘 기준 올해(12월이면 다음 해도) `baseDays` 재계산. 응답 `{ year, count, asOf, years: [{ year, count }] }` |
| `PATCH /approvals/leaves/grants/:userId` | ADMIN | `{ year?, permanentDays, permanentReason, adjustDays, adjustReason }` - 영구 조정(회원 설정, 올해부터 반영·입사한 해 제외)과 그 연도 조정을 한 번에. 0.25 단위, 0이 아니면 사유 필수. `year`를 비우면 올해, 다음 해는 12월에 행이 생긴 뒤 |

상신·회수·승인·반려·삭제·다시 기안은 결재 문서 API(`/approvals/documents/:id/...`)를 그대로 쓴다. 휴가 문서는 결재 문서 생성·수정 API로는 400.

## 4. 날짜·일수 다루기

- 입력·응답 날짜는 `"YYYY-MM-DD"`, 시각은 `"HH:mm"`. DB는 `@db.Date`(UTC 자정으로 저장), `@db.Time(0)`(1970-01-01 UTC 시각).
- 일수는 계산 중에는 **quarter 정수**(0.25일 = 1)로 다루고 저장할 때만 `Decimal(5,2)` 문자열로 바꾼다(부동소수점 오차 없음).
- 종일 = 달력 일수(주말·공휴일을 가정하지 않음), 반차 2, 반반차 1 quarter. 반차 종료 = 시작 + 4시간, 반반차 + 2시간.

## 5. ⭐ 상신·최종 승인 검사 (`assertCanUse`, 결재 트랜잭션 안)

```text
결재 서비스: 문서 행 조건부 UPDATE(잠금) → 처리기 호출(tx)
  └ 휴가: SELECT ... FROM users_model WHERE id = 신청자 FOR NO KEY UPDATE   ← 같은 회원의 검사를 한 줄로
       ① 시간 겹침: 같은 회원의 진행 중·승인 휴가(유형 무관, 자기 제외)와 시간이 겹치면 거부 (종일 = 그날 전체, 반차 = [시작, 종료))
       ② 하루 합계: 그 휴가들과 합쳐 날마다 ≤ 1일
       ③ 연차만: 그 연도 (진행 중 + 승인) 합계(자기 제외) + 이번 신청 ≤ 부여(base + adjust, 행이 없으면 0)
       실패 → 400 → 상신·승인 전체 롤백 (문서는 DRAFT / 진행 중 그대로)
```

- 회원 행 잠금이 없으면 같은 회원의 두 상신이 서로의 신청을 보지 못하고 둘 다 통과할 수 있다(e2e: 부여 3일에 2일 두 건 동시 상신 → 한 건만 200).
- `FOR NO KEY UPDATE`: 서로는 막지만, 다른 테이블이 이 회원을 FK로 참조하며 INSERT할 때 거는 `KEY SHARE` 잠금과는 충돌하지 않는다(`FOR UPDATE`면 그런 INSERT까지 기다림).
- 잠금 순서는 언제나 문서 행 → 회원 행이라 교착이 생기지 않는다.
- 최종 승인 때 다시 검사하는 이유: 상신 뒤 관리자 조정으로 부여가 줄었을 수 있다. 사용 일수는 저장하지 않으므로 "문서가 APPROVED가 되는 것 = 차감"이다.

## 6. 부여 재계산·조정

- 대상: 삭제·퇴사가 아닌 USER/ADMIN 중 입사일이 있는 회원(휴직 포함). 올해 행(12월이면 다음 해 행도, `recalcYears`)을 upsert하고 `baseDays`만 바꾼다. 한 트랜잭션 + 감사 로그 1행(`AuditTargetType.LEAVE`, 배치는 작업자 없음).
- 조정: 올해·다음 해 행만(지난 연도 400), 행이 없으면 404(재계산 먼저 / 다음 해는 12월부터). 부여 합계(계산값 + 영구 + 매년) < 0이면 400(25일 한도 없음), 잔여 음수는 허용. 감사 로그에 변경 전후 값.
- 영구 조정(2026-11-12): `LeaveUserSetting`(회원당 1행) 저장 → 올해 이후 행의 `permanentDays`를 같은 트랜잭션에서 갱신(입사한 해 행은 0, `permanentFor`). 재계산은 `baseDays`와 함께 `permanentDays`도 회원 설정에서 복사한다. 연도 행에 복사해 두는 이유: 영구값을 바꿔도 지난 연도 부여 기록(연차수당 근거)이 변하지 않게. 마이그레이션 `20261112220000_leave_permanent_adjust`

## 7. 테스트

- 단위 `util/leave-grant.calc.spec.ts`(매뉴얼 3.4 예시표 13행 + 연도 중간 기준일·12월 미리 계산·`recalcYears`·날짜 보조), `util/leave-request.util.spec.ts`(기간·시각 검사, 시간 겹침, 하루 합계, 캘린더 날짜별 묶기, 제목) - 34개.
- e2e `test/leaves.e2e-spec.ts` 18개(영구 조정: 사유 필수·한도 없음·재계산 유지·입사한 해 제외): 문서 유형(결재 API로 생성 400), 재계산·조정 유지·관리자 권한·조정 검사, 12월 재계산 → 다음 해 행·조정·신청(지난 연도 조정 400), 임시저장(달력 일수·제목)·수정(종일→반차, 결재 API 수정 400, 남의 문서 404), 입력 검사, 승인 시 사용/진행 중 반영·열람 권한, 잔여 부족 거부(롤백 후 DRAFT), 병가는 잔여 무관, 하루 합계, 시간 겹침, 캘린더(승인만·날짜별·유형 미노출·외부인 조회·기간 초과 400), 캘린더 게시판 "휴가자 표시" 옵션(캘린더만·타입 변경 시 해제·단일/통합 일정 응답의 `showLeaves`), ⭐ 동시 상신, 최종 승인 재검사 롤백, 다시 기안 복사.
- `.env.test`의 `ADDONS`에 `leaves`가 있어도(2026-11-12) 테스트 파일에서 `createTestApp([ LeavesModule ])`로 한 번 더 붙인다. `.env.test`에서 빠져도 이 파일은 돌아가게 하기 위함이고, 같은 모듈 클래스라 한 번만 등록된다(처리기 중복 등록 오류 없음 확인). `addonModule()`의 조건은 `AppModule`을 import하는 순간 정해져 `beforeAll`에서 `process.env.ADDONS`를 바꿔도 늦다(reservations.md와 같은 이유).

## 8. 남은 것

- ~~화면~~ → 2026-11-12 완료, [fe-13-leaves.md](../frontend/fe-13-leaves.md)
- ~~개발 `.env`·`.env.test`의 `ADDONS`에 `leaves` 추가~~ → 2026-11-12 사용자 완료
- ~~다음 해 휴가를 12월에 미리 신청~~ → 2026-11-12 해결: 12월 배치·재계산이 다음 해 행을 만든다(11월까지 다음 해 연차 신청은 부여 0으로 거부).
