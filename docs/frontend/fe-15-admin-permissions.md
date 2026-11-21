# FE-15 관리자 기능 권한 (슈퍼관리자 · 기능별 관리자 화면)

> 작성일: 2026-11-14 · 브랜치 `feature/admin`
> 규칙은 [features.md](../design/features.md) 5.1 "관리자 기능 권한". 백엔드는 `backend/src/auth/util/admin-permission.util.ts`, `backend/src/auth/decorator/require-admin.decorator.ts`, `backend/src/users/users.service.ts`.

## 1. 화면

- **관리자 화면 입장**: ADMIN·SUPER_ADMIN(`AdminGate`). 사이드바 하단의 [관리자 화면으로]도 두 권한에게만 보인다.
- **사이드바 메뉴**: 지정된 기능의 메뉴만 보인다(SUPER_ADMIN은 전부). 애드온 메뉴는 기존처럼 애드온이 켜져 있어야 보인다.
- **기능별 화면**: 기능이 없는 관리자가 주소로 직접 들어오면, 관리자 레이아웃은 유지하고 본문에 "접근 권한이 없습니다" 안내와 [대시보드로]를 보여 준다(`AdminPermissionGate`).
- **관리자 대시보드**: 지정된 기능의 카드만 보인다([fe-17-dashboard.md](fe-17-dashboard.md)). 기능이 하나도 없는 ADMIN에게는 "슈퍼관리자에게 요청" 안내가 나온다.
- **권한 지정** (회원 목록 ⋯ 메뉴 → 계정 섹션, 슈퍼관리자만)
  - 권한 선택: 직원 / 관리자 / 슈퍼관리자. 관리자를 고르면 **관리자 기능 체크박스**가 나오고 [변경] 한 번으로 권한과 기능을 함께 저장한다.
  - 관리자 권한이 줄어드는 변경(강등·기능 해제)이면 "이 회원은 다시 로그인해야 합니다" 안내가 나온다.
- **회원 관리 기능만 가진 관리자**가 볼 때
  - 가입 승인은 직원으로만 할 수 있다.
  - 직원 회원에게는 "관리자 지정은 슈퍼관리자만" 안내가 나온다(권한 선택 없음, 상태 변경은 가능).
  - 관리자 계정(ADMIN·SUPER_ADMIN)에서는 권한·상태 폼, 잠금 해제·비밀번호 초기화·삭제 대신 "슈퍼관리자만" 안내가 나온다.
  - 일괄 변경에서 고를 수 있는 권한은 직원뿐이다. 관리자 계정이 섞여 있으면 안내가 나온다(서버가 전체 403).
- **관리자 기능 표시**: 회원 상세 "권한·소속"과 ⋯ 메뉴 계정 섹션에 기능 목록이 보인다(슈퍼관리자는 "모든 기능").
- **업무 화면의 관리자 동작**
  - 예약: 남의 예약 수정·취소·삭제 버튼은 예약 관리 기능이 있을 때만 보인다.
  - 결재함: 전체 문서함은 결재라인 관리 기능이 있을 때만 보인다.
  - 결재자 교체 버튼은 원래 서버 응답(`permissions.canReplaceApprover`)으로 정한다.

## 2. 구조

| 파일 | 역할 |
|---|---|
| `src/types/user.ts` | `UserRole`에 `SUPER_ADMIN`, `AdminPermission` 타입 + `ADMIN_PERMISSION_LABEL`(표시 이름·순서) + `ADMIN_PERMISSIONS`. `CurrentUser.adminPermissions` |
| `src/lib/admin-permission.ts` | `isAdminRole`, `hasAdminPermission`: 백엔드 util과 같은 규칙. 여러 기능(가드·메뉴·예약·결재)이 쓰므로 `lib/`에 둔다 |
| `src/features/auth/guards/role-gate.tsx` | `AdminGate`(ADMIN 이상), `AdminPermissionGate`(기능별) |
| `src/app/admin/*/layout.tsx` | 화면마다 `AdminPermissionGate`. 애드온 화면은 `AddonGate` 안에 둔다(꺼진 애드온은 먼저 404) |
| `src/components/layout/nav-items.ts` | 메뉴 항목의 `permission` + `filterNavForAdminPermission` |
| `src/features/dashboard/components/admin-dashboard.tsx` | 관리자 대시보드(로그인한 관리자에 따라 카드가 달라서 Client Component) |
| `src/features/admin/components/users/user-account-section.tsx` | 권한 지정 폼(권한 + 기능 체크박스), 관리자 계정 보호 안내 |
| `src/services/api/users.ts` | `updateUserRole(id, role, adminPermissions?)` - `adminPermissions`를 생략하면 서버가 지금 값을 유지 |

## 3. 요청 흐름

```text
로그인/재발급 → access token payload에 role + perms
  └─ API 요청 → RolesGuard: @Roles 등급 → @RequireAdmin(permission) 기능 확인 (DB 조회 없음)
화면 → GET /users/me(DB 최신값)의 role·adminPermissions로 메뉴·게이트 결정
```

- 화면은 `/users/me`(DB 값), 서버 판단은 토큰(`perms`)을 본다. 그래서 기능을 막 추가한 직후에는 메뉴가 보여도 API가 403일 수 있다(최대 10분, 재발급 때 맞춰짐). 회수는 서버가 `tokenVersion`을 올려 다시 로그인하게 한다.

## 4. 설계 포인트
- **왜 권한을 토큰에 넣었나**: access 검증을 DB 없이 하는 기존 원칙(stateless)을 지키기 위해서다. 대가는 변경 반영이 최대 10분 늦는 것이다. 회수만 `tokenVersion`으로 다시 로그인을 강제한다.
- **왜 별도 테이블이 아니라 enum 배열인가**: 기능 수가 고정(7개)이고 회원에 딸린 값이라 조인이 필요 없다. 알림 받는 사람 조회는 `adminPermissions: { has: 'USERS' }`로 한다.
- **마지막 슈퍼관리자 동시성**: 둘이 동시에 서로를 강등하면 둘 다 "상대가 남는다"고 판단해 0명이 될 수 있다. 그래서 슈퍼관리자 행을 `FOR UPDATE`로 잠근 뒤 센다.
- **권한 상승 경로 차단**: 회원 관리 기능을 가진 ADMIN이 남을 ADMIN으로 올리거나, 슈퍼관리자를 정지·삭제하거나, 비밀번호를 초기화할 수 없게 막았다(`assertCanManageAccount`).
