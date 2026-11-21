# FE-17 사용자·관리자 대시보드, 감사 로그 조회

> 작성일: 2026-11-18

## 1. 화면

| 경로 | 화면 | 내용 |
|---|---|---|
| `/` | 사용자 대시보드 | 결재 대기·진행 중·임시저장 건수, 남은 연차, 오늘 일정, 최근 공지, 내 할 일 |
| `/admin` | 관리자 대시보드 | 회원 현황, 월별 매출·지출, 거래처별 매출 순위, 오늘 예약, 최근 관리 활동 |
| `/admin/audit` | 감사 로그 | 기간·행동·대상·작업자 필터, 변경 내용 상세, "더 보기" |

- 일정 카드는 [일정]·[달력] 탭으로 나뉜다. 달력에서 날짜를 누르면 [일정] 탭이 그 날짜의 일정으로 바뀌고 제목이 `O월 O일 일정`이 되며, [오늘] 버튼으로 돌아온다.
- 꺼진 애드온의 카드는 만들지 않는다. 컴포넌트가 마운트되지 않으므로 그 API도 호출하지 않는다.
- 관리자 카드는 그 기능을 가진 관리자에게만 보인다.

| 관리자 카드 | 필요한 기능 |
|---|---|
| 회원 현황 | `USERS` |
| 매출·지출 그래프 | `PROJECTS` + 애드온 `projects` |
| 오늘 예약 | `RESERVATIONS` + 애드온 `reservations` |
| 최근 관리 활동, 감사 로그 화면 | `AUDIT` |

## 2. 구조

| 파일 | 역할 |
|---|---|
| `src/features/dashboard/components/user-dashboard.tsx` | 사용자 대시보드 카드 |
| `src/features/dashboard/components/admin-dashboard.tsx` | 관리자 대시보드 카드 |
| `src/features/dashboard/components/schedule-calendar.tsx` | 일정 카드의 월 달력 (일자만 표시, 토요일 파란색·일요일과 공휴일 빨간색) |
| `src/hooks/use-holidays.ts` | 달력에 보이는 연도의 공휴일 조회 (대시보드 달력·게시판 캘린더 공용) |
| `src/features/dashboard/components/dashboard-card.tsx` | 카드 틀, 숫자 칸, 카드 안의 로딩·오류·빈 목록 |
| `src/features/dashboard/hooks/use-dashboard.ts` | 대시보드 전용 조회 훅과 queryKey, 오늘(KST) 범위 계산 |
| `src/features/admin/components/audit/audit-log-view.tsx` | 감사 로그 필터·목록·상세 |
| `src/services/api/audit-logs.ts` | `GET /common/audit-logs` |
| `src/types/audit.ts` | 감사 로그 타입, 행동·대상 이름 |

## 3. 새 백엔드 API

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/common/audit-logs` | `AUDIT` | 감사 로그 목록. 최신순 커서, 꺼진 애드온의 대상은 제외 |
| GET | `/users/stats` | `USERS` | 가입 승인 대기, 재직, 비활성, 로그인 잠금 건수 |
| GET | `/boards/recent-notices` | USER 이상 | 읽을 수 있는 공지 게시판의 최신 글 5건. 비밀글 제외, 작성자 미포함 |
| GET | `/common/holidays?year=` | USER 이상 | 그해 공휴일. 대시보드 달력과 게시판 캘린더가 함께 사용 |

### 공휴일 연동

한국천문연구원 특일 정보 API(`getRestDeInfo`, XML)를 서버에서 호출한다. 키는 `backend/.env`의 `HOLIDAY_API_KEY`다.

| 항목 | 동작 |
|---|---|
| 캐시 | 연도별 서버 메모리, 성공 24시간 |
| 실패 | 이전 결과 또는 빈 목록을 주고 10분 뒤 재시도. 달력은 공휴일 색만 빠진다 |
| 조회 범위 | 올해 앞뒤 2년. 밖의 연도는 외부 호출 없이 빈 목록 |
| 동시 요청 | 같은 연도는 외부 호출 1번으로 합친다 |
| 화면 표시 | 두 달력 모두 날짜 숫자만 빨간색으로 표시한다. 이름은 날짜에 마우스를 올리면 보인다 |

## 4. 요청 흐름

```text
page.tsx (Server) → UserDashboard / AdminDashboard (Client)
  → useEnabledAddons + hasAdminPermission으로 카드 결정
  → 카드마다 자기 훅 호출 → services/api → NestJS
```

`page.tsx`는 제목만 그리는 Server Component다. 카드 구성은 로그인한 회원의 권한과 켜진 애드온에 따라 달라서 Client Component에서 정한다.

## 5. 설계 포인트
- **집계 API 하나가 아니라 카드별 호출을 고른 이유**: 핵심 모듈은 애드온을 import할 수 없다. 카드별로 호출하면 이 규칙을 지키고, 카드 하나가 실패해도 나머지는 보인다. 대신 요청 수가 늘어난다.
- **감사 로그를 커서 페이지네이션으로 조회하는 이유**: 계속 쌓이는 테이블이라 전체 건수 계산과 큰 OFFSET을 피한다. 기본키가 시간순으로 늘어나므로 `id DESC`가 곧 최신순이다.
- **꺼진 애드온 로그 제외에서 NULL을 따로 처리하는 이유**: SQL의 `NOT IN`은 NULL 행을 결과에서 빼므로 `targetType IS NULL` 조건을 함께 둔다.
- **공휴일 API를 서버에서 호출하는 이유**: 키를 브라우저에 노출하지 않고, 캐시로 접속자 수와 관계없이 외부 호출 수를 일정하게 유지해 일일 한도(10,000건)를 지킨다. 외부 장애가 나도 달력은 공휴일 색만 빠지고 동작한다.
- **대상과 애드온 대응표를 `Record<AuditTargetType, ...>`로 선언한 이유**: enum에 값이 추가됐는데 대응표를 채우지 않으면 컴파일 오류가 난다.
