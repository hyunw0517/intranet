# FE-11 시설 예약 (시간표 · 예약 · 내 예약 · 관리자 시설·예약 관리) + 애드온 메뉴 제어

> 작성일: 2026-11-09 · 브랜치 `frontend/facility`
> 업무 규칙은 [features.md 6장](../design/features.md), 백엔드 구조·API는 [backend/reservations.md](../backend/reservations.md).
> 화면 결정(사용자): 시간표는 **하루(시설별 열) / 주간(시설 하나) 전환**, 예약은 **빈 칸 클릭 + [예약] 버튼** (드래그 선택은 넣지 않음)

## 1. 화면과 경로

| 경로 | 화면 | 누가 |
|---|---|---|
| `/reservations` | 시간표: 분류 탭 · 날짜 이동 · 하루/주간 · 빈 칸 클릭 → 예약 창 · 예약 클릭 → 상세 | 직원 |
| `/reservations/me` | 내 예약: 예정 / 지난 예약 / 취소 탭, 예정에서 여러 건 골라 일괄 취소 (알림의 이동 주소) | 직원 |
| `/admin/facilities` | 시설 관리: 왼쪽 분류(예약 규칙, 드래그 정렬) / 오른쪽 시설, 시설별 사용 불가 기간 | 관리자 |
| `/admin/reservations` | 예약 관리: 시설·상태·기간 필터, 시간 변경·취소·삭제, 체크박스로 골라 일괄 시간 변경·취소·삭제(`admin-reservation-bulk-actions.tsx`, 선택은 현재 페이지 안에서만 - 페이지·필터를 바꾸면 해제. 시간 변경·취소는 선택이 모두 "예약됨 + 시작 전"일 때만, 시간 선택지는 선택한 예약들의 분류 규칙에 공통인 시각만) | 관리자 |

- 사이드바: 직원 "업무 > 시설 예약" 하나 (시간표·내 예약은 화면 안의 탭), 관리자 "시설 관리"·"예약 관리"
- 시간표의 분류·날짜·보기·시설은 URL(`?category=&date=&view=week&facility=`)에 둔다 → 새로고침·뒤로 가기에도 유지 (캘린더 게시판과 같은 방식)

## 2. 애드온 메뉴 제어 (첫 애드온이라 공통으로 만듦)

```text
GET /common/addons ── useEnabledAddons (staleTime: Infinity - 배포 설정이라 실행 중 바뀌지 않음, GUEST는 403이라 호출 안 함)
  ├ 사이드바: nav-items의 항목에 addon: "reservations" → filterNavForAddons로 꺼진 애드온 메뉴 제거
  └ 페이지: app/(main)/reservations/layout.tsx, app/admin/{facilities,reservations}/layout.tsx 가 <AddonGate name="reservations">로 감쌈
            → 꺼져 있으면 notFound() = 일반 404 페이지 (2026-11-09 사용자 결정)
```

- 화면 숨김은 편의일 뿐, 실제 차단은 서버(애드온 모듈이 등록되지 않아 API 404)
- 새 애드온을 붙일 때: `services/api/addons.ts`의 `AddonName`(백엔드 이름과 같게) → 메뉴 항목에 `addon` → 페이지 레이아웃을 `AddonGate`로

## 3. 파일과 역할

| 파일 | 역할 |
|---|---|
| `services/api/reservations.ts` · `facilities.ts` · `facility-categories.ts` · `facility-unavailable.ts` · `addons.ts` | 백엔드 컨트롤러와 1:1 |
| `types/reservation.ts` | 응답 타입, 상태·요일·건너뛴 이유 표시 이름 |
| `features/addon/hooks/use-addons.ts`, `features/addon/guards/addon-gate.tsx` | 켜진 애드온 조회, 페이지 접근 제어 |
| `features/reservation/reservation-time.ts` | KST 날짜·분 계산, 서버로 보낼 `+09:00` ISO, 시각 선택지 |
| `features/reservation/reservation-permission.ts` | 수정·취소·삭제 버튼 표시 판단 (서버 규칙과 같게) |
| `features/reservation/hooks/use-reservations.ts` | `reservationKeys`, 분류·시설·시간표·내 예약·상세 조회, 변경 후 `reservationKeys.all` 무효화 |
| `features/reservation/components/schedule-view.tsx` | 시간표 화면 (URL 상태, 하루/주간 열 구성) |
| `.../time-grid.tsx` | 하루·주간이 같이 쓰는 격자 (열 = 날짜×시설) |
| `.../reservation-form-dialog.tsx` | 예약 만들기(한 번·반복)·수정 창 |
| `.../reservation-detail-dialog.tsx` | 예약 상세 + 권한별 버튼 |
| `.../my-reservations-view.tsx`, `reservation-nav.tsx` | 내 예약, 시간표·내 예약 탭 |
| `features/admin/hooks/use-admin-facilities.ts` | 관리자 queryKey, 변경 시 관리자 키 + `reservationKeys.all` 함께 무효화 |
| `features/admin/components/facilities/*` | 시설 관리(분류·시설·사용 불가 기간), 예약 관리 |

## 4. 시간 처리 (KST)

- 화면 안에서는 날짜를 `"YYYY-MM-DD"`, 시각을 **그날 00:00부터의 분**으로 다룬다. 분류 규칙(`openMinute`·`slotMinutes`)과 같은 단위라 선택지 계산이 단순하다.
- 서버로 보낼 때 `kstIso(date, minute)` → `"2026-11-12T10:00:00+09:00"`. 브라우저 시간대와 관계없이 같은 시각이 된다. (24:00은 다음 날 00:00)
- 서버 응답(UTC ISO)을 그 열의 날짜 기준으로 `minutesFromDayStart`로 바꿔 격자 위치를 정한다. 여러 날에 걸친 사용 불가 기간은 열마다 운영 시간만큼 잘라 그린다.
- "지난 칸"(시작 ≤ 지금)은 서버의 "지난 예약" 기준과 같게 비활성화한다.

## 5. 시간표 격자 (`TimeGrid`)

- 하루 보기 = 같은 날짜 × 분류의 시설들, 주간 보기 = 같은 시설 × 월~일. 둘 다 "열 = (날짜, 시설)"이라 격자 하나로 그린다.
- 빈 칸은 `<button>`(aria-label "A실 10:00 예약")이라 키보드·스크린리더로도 예약할 수 있다. 예약 블록·사용 불가 기간은 그 위에 절대 위치로 겹친다.
- 한 칸 최소 높이 22px (예약 단위가 짧아도 누를 수 있게). 열이 많으면 격자 안에서만 가로 스크롤(시간 축 고정) → 페이지 가로 넘침 없음.
- 내 예약은 포인트 색으로 구분, 오늘 열에는 현재 시각 선.

## 6. 예약 창

- 한 번 / 반복 탭. 반복은 기간 + 요일(운영 요일만 선택 가능) + 같은 시간대 → 결과 화면에 만든 건수와 **건너뛴 날짜·이유**(이미 예약됨·사용 불가 기간·운영 안 하는 요일·지난 시각)
- 시각 선택지는 분류 규칙으로 만든다(운영 시간 안, 단위마다). 날짜는 오늘 ~ 예약 가능 마지막 날
- 겹침·사용 불가 기간·규칙 위반의 최종 판단은 서버 → 400·409 메시지를 폼 위에 그대로 보여 준다
- 수정은 시간·제목·설명만 (시설 변경 불가 안내)

## 7. 데이터 흐름

```text
[시간표]  useFacilityCategories → useFacilities(categoryId) → useSchedule({ categoryId | facilityId, from, to })  (keepPreviousData)
[예약]    useReservationMutation(createReservation …) → 성공 시 reservationKeys.all 무효화 → 시간표·내 예약·상세 다시 조회
[관리자]  useAdminFacilityMutation → adminFacilityKeys.all + reservationKeys.all 무효화
```

- 내 예약의 "지금"은 화면을 열 때 한 번만 정한다 (`useState(() => new Date().toISOString())`). 렌더마다 바뀌면 queryKey가 바뀌어 계속 다시 조회된다.

## 8. 확인 (2026-11-09)

- `tsc --noEmit`, ESLint, `next build` 통과
- Chrome + playwright-core(스크래치)로 실제 백엔드·DB에서 27개 항목 통과
  - 관리자: 메뉴 표시, 분류 검증 오류(단위로 안 나누어짐), 분류 추가(24시간·매일), 시설 2개, 사용 불가 기간 등록·목록
  - 직원: 메뉴 표시, 하루 보기 시설별 열·사용 불가 기간, 빈 칸 클릭 → 시각 채워짐 → 예약 → 블록 표시, 겹침 409·사용 불가 409 메시지, 반복 예약 3건 생성·1건 건너뜀(이유), 상세 권한 버튼, 주간 7일 열, 내 예약 4건 → 2건 일괄 취소 → 취소 탭 2건
  - 관리자 예약 관리에서 직원 예약 취소(확인 창의 알림 안내) → 직원에게 `RESERVATION_CANCELLED_BY_ADMIN` 알림 생성(DB 확인)
  - 애드온 꺼짐(응답을 빈 목록으로 바꿔 확인): 메뉴 숨김, 주소 직접 접근 → 404
  - 390px 다크(시간표·내 예약), 768px(시설 관리) 가로 넘침 없음. 콘솔 오류는 일부러 겹치게 요청한 409 두 건뿐
- 확인용 데이터(분류·시설·예약·관련 알림·감사 로그)는 삭제
- **(2026-11-10 수정) 사용 불가 기간 입력**: `<input type="datetime-local" step=300>`은 step을 강제하지 않아(직접 입력·선택기, 폼은 noValidate) 13:04 같은 분이 저장됐다 → 날짜 입력 + 시각 Select(`slotTimes`: 00:00부터 분류의 예약 단위마다, 종료는 24:00까지)로 변경. 목적은 화면에서 애매한 시각이 들어가지 않게 하는 것이라 서버 검사는 넣지 않음 (처음에 서버 검사·운영 시작 기준 경계까지 넣었다가 과설계라는 사용자 판단으로 되돌림). 브라우저 확인: 선택지 48개·13:04 없음, 24:00, 13:00~15:00 저장
- 미확인: 사용 불가 기간 **수정** 화면(API는 있음, 화면은 등록·삭제만), 관리자 분류 드래그 정렬 실제 조작

## 9. 설계 포인트
- 애드온 ON/OFF를 프론트까지: 메뉴 숨김(편의)과 서버 404(보안)의 역할 분리, `notFound()`로 일반 404
- 시간대: 화면은 "날짜 + 분"으로 계산하고 보낼 때만 `+09:00` ISO → 서버·브라우저 시간대와 무관
- 하루·주간 보기를 "열 = (날짜, 시설)" 하나의 격자로 일반화
- 서버가 최종 판단(겹침·규칙), 화면은 선택지 제한과 메시지 표시
