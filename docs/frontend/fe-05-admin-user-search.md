# FE-05. 관리자 회원 목록 검색·필터·정렬 확장

> 작업일: 2026-11-01 · 대상 화면: `/admin/users` (회원 탭)
> 회원 목록 화면 전체 구조는 [fe-02-admin.md](fe-02-admin.md)를 참고한다. 이 문서는 추가된 부분만 다룬다.

## 1. 추가된 기능

| 구분 | 내용 | URL 파라미터 |
|---|---|---|
| 검색 | 검색 항목 Select에 **부서** 추가 (부서명 부분 일치, 겸직 소속 포함) | `field=departmentName&q=...` |
| 필터 | **직급**, **직책** Select (권한·상태 옆, 고르는 즉시 반영) | `position=<id>`, `jobTitle=<id>` |
| 정렬 | **사번 / 이름 / 대표 소속 / 직급** 머리글 클릭 | `sort=<field>&order=asc\|desc` |

- 정렬은 같은 머리글을 누를 때마다 **오름차순 → 내림차순 → 해제(기본: 가입일 최신순)** 로 바뀐다.
- 필터·정렬을 바꾸면 1페이지로 돌아간다. (기존 `updateFilters` 규칙 그대로)
- 모든 조건이 URL에 있으므로 상세 페이지에서 뒤로 가기·새로고침해도 유지된다.

## 2. 백엔드 API 변경 (`GET /users`, `PaginateUserQueryDto`)

| 파라미터 | 타입 | 동작 |
|---|---|---|
| `departmentName` | string | 삭제되지 않은 소속 중 하나라도 부서명이 부분 일치 |
| `jobTitleId` | int | 삭제되지 않은 소속 중 하나라도 해당 직책 |
| `positionId` | int | 회원 직급 (`Users.positionId`) |
| `sortBy` | `createdAt`(기본) / `empNo` / `name` / `department` / `position` | |

- 부서명과 직책을 함께 주면 **같은 소속 행**이 두 조건을 모두 만족해야 한다. (`departments: { some: { ... } }` 하나에 같이 넣음 → "개발팀의 팀장")
- `position` 정렬은 직급 **이름이 아닌 순위(`Position.sortOrder`)** 기준이다. 직급이 없는 회원은 오름차순에서 맨 뒤, 내림차순에서 맨 앞(PostgreSQL NULL 기본 정렬).
- `department` 정렬은 **대표 소속 부서명** 기준이다. 아래 3장 참고.

## 3. 소속 정렬을 따로 처리한 이유

회원:소속은 1:N 관계다. Prisma `orderBy`는 to-many 관계에 대해 `_count` 정렬만 지원하므로 "대표 소속의 부서명"으로 정렬할 수 없다.

선택지:

| 방법 | 장점 | 단점 |
|---|---|---|
| raw SQL (`LEFT JOIN ... ORDER BY`) | DB에서 정렬·페이지 처리 | 검색·필터 조건(`where`)을 SQL로 중복 작성해야 함 |
| **조건에 맞는 id + 대표 부서명만 조회 → 메모리 정렬 → 해당 페이지 id만 목록 조회** (채택) | `where`를 Prisma 그대로 재사용, 이해하기 쉬움 | 조건에 맞는 전체 회원을 한 번 읽음 |

사내 회원 수(수백~수천 명)에서는 가벼운 컬럼 두 개만 읽으므로 충분하다고 판단했다. 규모가 커지면 raw SQL로 바꾼다.
`IN` 조회는 순서를 보장하지 않으므로, 페이지 데이터는 정렬된 id 순서로 다시 맞춘다. (`users.service.ts`의 `paginateUserByDepartment`)

## 4. 프론트 파일 변경

| 파일 | 변경 |
|---|---|
| `services/api/users.ts` | `UserListQuery`에 `departmentName`, `positionId`, `jobTitleId`, `sortBy`, `order` 추가. `UserSortBy`, `SortOrder` 타입 |
| `features/admin/components/users/user-list-view.tsx` | `SEARCH_FIELDS`에 부서, URL ↔ 필터 변환(`readFilters`/`toQuery`/`updateFilters`)에 직급·직책·정렬 추가, `SortableHead` 머리글 컴포넌트 |

- 직급·직책 옵션은 조직 관리 화면과 같은 훅(`usePositions`, `useJobTitles`)을 쓴다. 같은 queryKey라 캐시를 공유하고, 조직을 수정하면 함께 갱신된다.
- `SortableHead`는 `<th>` 안에 `<button>`을 두어 키보드로 정렬할 수 있게 하고, `aria-sort`로 현재 정렬 상태를 스크린리더에 알린다.
- 좁은 화면에서는 필터 Select 4개를 2열 그리드로 배치한다. (`grid grid-cols-2 lg:flex`)
- 정렬 머리글은 회원 탭에만 있다. 삭제된 회원 탭은 기존 표 그대로다.

## 5. 확인 결과 (2026-11-01)

- 백엔드: `UsersService.paginateUser`를 실제 DB(회원 203명)에 직접 호출해 확인. 정렬 4종(오름·내림), 소속 정렬 2페이지, 직급·직책 필터, 부서명 검색, 허용되지 않은 `sortBy` 거부(ValidationPipe 400 메시지)까지 정상.
- `npx tsc --noEmit` (backend 통과, frontend는 이번 변경과 무관한 `.next/types`의 오래된 경로 오류 1건), `eslint` 통과.

### 해결한 문제: 이름 정렬의 한글 순서

DB 기본 collation이 `en_US.utf8`(glibc)이라 한글 이름이 가나다순으로 정렬되지 않았다. (내림차순에서 `유저3`이 `한…`보다 위에 표시됨)

```text
DB 기본    가나 유저 하나 김철수 이영희 한하준 유저3
ko-x-icu   가나 김철수 유저 유저3 이영희 하나 한하준   ← JS localeCompare('ko')와 동일
```

- 해결: 마이그레이션 `20261101102319_users_name_collation_ko`에서 `users_model.name` 컬럼 collation을 `ko-x-icu`로 변경
- Prisma 스키마에는 collation 문법이 없어 SQL을 직접 작성했다. 적용 후 `migrate dev --create-only`가 빈 마이그레이션을 만드는 것으로 Prisma가 이 변경을 되돌리지 않는 것을 확인했다.
- 확인: 회원 203명 전체의 DB 이름 정렬 결과가 `localeCompare('ko')`와 일치. 소속 정렬은 원래 메모리에서 `localeCompare('ko')`로 정렬하므로 영향 없음.
- 다른 이름 컬럼(부서명 등)을 DB에서 정렬하게 되면 같은 방식으로 바꾼다.

## 6. 설계 포인트
- to-many 관계 값으로 정렬할 수 없는 ORM 제약과, raw SQL 대신 "id만 정렬 후 페이지 조회"를 고른 이유·한계
- 겸직 소속에서 `some` 조건 하나에 부서·직책을 같이 넣은 의미 (각각 넣으면 "개발팀 소속 + 다른 부서에서 팀장"도 걸림)
- 직급 정렬을 이름이 아닌 `sortOrder`로 한 이유
- DB collation에 따라 한글 정렬 결과가 달라지는 문제
