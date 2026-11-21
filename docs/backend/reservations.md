# 시설 예약 (애드온 `reservations`) 백엔드 구조

> 작성일: 2026-11-09 · 설계는 사용자, 구현은 Claude (2026-11-05 작업 방식)
> 규칙의 원본은 [features.md 6장](../design/features.md). 이 문서는 코드 구조와 흐름을 복습하기 위한 설명이다.

## 1. 파일

```text
src/reservations/
├── reservations.module.ts              # 애드온 모듈 (AppModule에서 addonModule('reservations', …)로만 등록)
├── facility-categories.controller/.service.ts   # 분류 (예약 규칙을 가진다)
├── facilities.controller/.service.ts            # 시설
├── facility-unavailable.controller/.service.ts  # 사용 불가 기간 (관리자, 저장 + 경고)
├── reservations.controller/.service.ts          # 예약·반복 예약·시간표·취소·삭제
├── reservation-notifier.ts             # 관리자가 남의 예약을 취소·삭제하면 예약자에게 알림 (커밋 후, bestEffort)
├── util/
│   ├── reservation-rules.util.ts       # 시간 규칙 판단 (DB 없음, 단위 테스트 대상)
│   └── overlap-error.util.ts           # DB 겹침 제약 위반(23P01) 판별
├── const/reservation.const.ts
└── dto/
```

- 컨트롤러 등록 순서: `ReservationsController`를 **마지막**에 둔다. Nest는 배열 순서대로 라우트를 등록하므로, 먼저 두면 `GET /reservations/categories`가 `GET /reservations/:id`(id = "categories")에 잡혀 400이 된다.
- 공통 날짜 계산(KST 분·요일·날짜 문자열)은 `common/util/date.util.ts`에 추가했다. 회사 시간대 계산은 이 파일 하나에 모은다.

## 2. API

모든 경로는 애드온이 꺼지면 404. 권한 표기: U = USER 이상, A = ADMIN.

| 메서드 | 경로 | 권한 | 비고 |
|---|---|---|---|
| GET | `/reservations/categories` | U | 규칙 포함, `openTime`·`closeTime`("HH:mm")도 함께 |
| POST / PATCH `:id` / DELETE `:id` | `/reservations/categories` | A | 시설이 남은 분류 삭제 409. 규칙 변경은 새 예약부터 |
| PATCH | `/reservations/categories/order` | A | `{ ids }` 직급·직책과 같은 방식 |
| GET | `/reservations/facilities?categoryId=` | U | 사용 중인 시설만 |
| GET | `/reservations/facilities/admin` | A | 사용 안 함 포함 |
| GET | `/reservations/facilities/:id` | U | 분류 규칙 포함 |
| POST / PATCH `:id` / DELETE `:id` | `/reservations/facilities` | A | 앞으로의 예약이 있으면 삭제 409, 사용 안 함은 허용(기존 예약 유지) |
| GET / POST / PATCH `:id` / DELETE `:id` | `/reservations/facilities/:facilityId/unavailable` | A | 등록·수정 응답 `{ unavailable, conflicts }` |
| GET | `/reservations/schedule?facilityId= 또는 categoryId=&from=&to=` | U | 최대 31일, 예약 제목·예약자 이름 공개, `isMine` |
| GET | `/reservations/me` | U | 내 예약 (취소 포함, 삭제 제외), 페이지 |
| GET | `/reservations/admin` | A | 시설·예약자·상태·기간 필터 |
| GET | `/reservations/:id` | U | |
| POST | `/reservations` | U | 규칙 위반 400, 겹침·사용 불가 409 |
| POST | `/reservations/recurring` | U | `{ created, skipped: [{ date, reason }] }` |
| PATCH | `/reservations/:id` | 본인·A, 시작 전 | 시간·제목·설명 (시설 변경 불가) |
| PATCH | `/reservations/:id/cancel`, `/reservations/bulk/cancel` | 본인·A, 시작 전 | 일괄은 하나라도 안 되면 전체 실패 |
| DELETE | `/reservations/:id` | 본인(시작 전)·A(언제나) | soft delete |

## 3. 겹침 방지 ⭐ (이중)

```text
POST /reservations
 ├ ① 규칙 검사 (checkReservationTime)          → 400  (단위·운영 시간·요일·기간·과거·하루 넘김)
 └ $transaction
    ├ ② 겹치는 예약 findFirst / 사용 불가 기간 findFirst → 409 (사용자 메시지)
    └ ③ INSERT → DB exclusion constraint (facility_reservation_no_overlap)
              ② 와 ③ 사이에 다른 요청이 같은 시간을 저장했다면 여기서 23P01
              → withOverlapGuard가 409로 바꿔 응답
```

- ②만 있으면: 두 요청이 동시에 "겹침 없음"을 확인하고 둘 다 저장할 수 있다(검사와 저장 사이 경쟁 상태). READ COMMITTED에서는 아직 커밋되지 않은 다른 요청의 INSERT가 보이지 않는다.
- ③만 있으면: 막히기는 하지만 메시지를 만들 수 없고, 사용 불가 기간(다른 테이블)은 DB 제약으로 막을 수 없다.
- 제약 조건: `EXCLUDE USING gist (facility_id WITH =, tsrange(start_at, end_at, '[)') WITH &&) WHERE (status = 'RESERVED' AND deleted = false)` → 취소·삭제된 예약의 시간은 다시 예약할 수 있다.
- Prisma 7 + 드라이버 어댑터의 오류 형태: `PrismaClientKnownRequestError`, `meta.driverAdapterError.cause.originalCode === '23P01'` (실제 오류로 확인 후 작성).
- 시설 행 잠금(`SELECT … FOR UPDATE`)은 쓰지 않았다. DB 제약이 최종 방어를 하므로 잠금 없이도 결과가 같고, 잠금은 같은 시설의 다른 시간대 예약까지 줄 세운다.

## 4. 시간 규칙 (KST)

- 분류 컬럼: `slotMinutes`, `openMinute`·`closeMinute`(자정부터 분), `operatingDays`(ISO 요일), `maxAdvanceDays`.
- `checkReservationTime(start, end, rules, now)` 검사 순서 = 메시지 우선순위: 범위 → 과거(시작 ≤ 지금) → 하루 넘김 → 요일 → 운영 시간 → 단위(운영 시작 기준) → 예약 가능 기간.
- 요일·날짜는 반드시 KST로 계산한다. KST 11/11 00:30은 UTC로 11/10 15:30이라 서버 시간대로 계산하면 요일이 틀린다(단위 테스트로 고정).
- 24시간 운영(00:00~24:00)이면 23:30~24:00(다음 날 00:00)까지 하루 안으로 본다.

## 5. 반복 예약

1. 날짜 목록: `listRecurringDates(startDate, endDate, weekdays)`
2. 날짜마다 규칙 검사: `NOT_OPERATING_DAY`·`PAST`는 건너뜀, 그 밖의 위반(운영 시간 밖 등)은 모든 날짜가 같으므로 **전체 400**
3. 트랜잭션: 기간 전체의 기존 예약·사용 불가 기간을 **한 번씩만** 조회해 메모리에서 날짜별 비교 → `RESERVED`·`UNAVAILABLE` 건너뜀
4. `createManyAndReturn`으로 한 번에 저장, 감사 로그는 1행(`logBatch`, 건너뛴 날짜 포함)
5. ②~④ 사이에 다른 요청이 끼어들면 DB 제약으로 전체 409 → 다시 시도하면 그 날짜는 건너뜀 (드문 경우라 감수, 사용자 확인)

## 6. 권한·알림·감사 로그

- 수정·취소: 본인·관리자, `RESERVED`, 시작 전. 삭제: 본인은 시작 전, 관리자는 언제나.
- 일괄 취소: 검사 조건을 `updateMany`의 WHERE에 다시 걸고 `count`가 요청 수와 다르면 롤백 (회원 일괄 처리와 같은 방식).
- 알림: 관리자가 **남의** 예약을 취소·삭제하거나 **시간을 바꿀 때**(제목·설명만 고치면 없음, 내용에 "이전 → 변경" 시간)만, 커밋 후 `ReservationNotifier`(발신자 NULL, link `/reservations/me`). 사용 불가 기간 등록에는 보내지 않음.
- 감사 로그 대상: `FACILITY_CATEGORY` / `FACILITY`(사용 불가 기간 포함) / `FACILITY_RESERVATION`. 취소는 `STATUS_CHANGE`.

## 7. 테스트

- 단위 `src/reservations/util/reservation-rules.util.spec.ts` (26개): 경계(09:00 시작·18:00 종료), 위반 12종, 예약 가능 기간 마지막 날, **KST 요일**, 24시간 운영, 반복 날짜(월·연도 넘김)
- e2e `test/reservations.e2e-spec.ts` (38개): ⭐ 동시 10건 → 1건만 201·9건 409·DB 1건, DB 제약 직접 위반 판별, `[)` 경계, 다른 시설 허용, 취소 후 재예약, 규칙 400 5종, 사용 불가 기간(경고·기존 유지·새 예약 409·권한), 반복(건너뜀 이유·전체 400·일괄 취소·남의 예약 섞이면 전체 실패), 권한(타인 403, 시작 후 본인 불가·관리자 삭제만), 관리자 취소·삭제·시간 변경 알림, 제목만 변경·본인 처리 시 알림 없음, 시설·분류 삭제 409, 사용 안 함, 라우트 순서, 시간표 공개 정보, 31일 제한, 애드온 꺼짐 404
- 3회 연속 실행 모두 통과 (2026-11-09)

## 8. 진행 중 고친 것

- **e2e 앱에 전역 ValidationPipe가 없었음**: `createNestApplication()`은 `main.ts`를 거치지 않아 DTO 변환(문자열 → Date·숫자)이 빠졌다 → `src/app.setup.ts`의 `configureApp()`으로 빼서 `main.ts`와 테스트(`test/utils/app.ts`)가 같이 쓴다.
- **애드온 등록은 `app.module.ts` import 시점에 한 번 정해짐**: `@Module` 데코레이터가 import할 때 평가되므로, 테스트에서 `beforeAll`로 `ADDONS`를 바꿔도 반영되지 않았다 → `.env.test`에 `ADDONS=reservations`, 꺼진 경우는 `jest.isolateModulesAsync`로 모듈을 새로 불러와 확인.
- **마이그레이션 폴더 순서**: KST/UTC가 섞여 새 폴더가 앞에 정렬될 뻔함 → 이름을 바꾸고 빈 DB에서 28개 순서대로 적용 확인.

## 9. 남은 것

- 프론트: 예약 화면(시간표·예약·반복·내 예약), 관리자 화면(분류·시설·사용 불가 기간), 메뉴의 애드온 켜짐 확인(`GET /common/addons`), 알림 link `/reservations/me` 화면
