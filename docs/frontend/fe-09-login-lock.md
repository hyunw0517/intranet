# FE-09 관리자 회원 상세 - 로그인 잠금 해제

> 작성일: 2026-11-09 · 브랜치 `backend/audit`
> 백엔드 규칙(5회마다 10분 → 30분 → 1시간, 성공·관리자 해제 시 초기화)은 [features.md](../design/features.md) 5.2, 구조는 백엔드 `auth/login-history.service.ts`.
> 관리자 회원 화면 전체 구조는 [fe-02-admin.md](fe-02-admin.md).

## 1. 화면

관리자 회원 상세(`/admin/users/[id]`) > **계정 관리** 섹션 맨 위에 "로그인 잠금" 행을 추가했다. (비밀번호 초기화·회원 삭제와 같은 행 형식)

| 서버 `loginLock` | 표시 | 버튼 |
|---|---|---|
| `null` (실패 기록 없음) | 로그인 실패 기록이 없습니다. | [잠금 해제] 비활성 |
| `isLocked: true` | `잠김` 배지 + "연속 실패로 yyyy-MM-dd HH:mm까지 로그인이 막혀 있습니다. (N단계)" | [잠금 해제] |
| `isLocked: false`, 기록 있음 | 잠겨 있지 않습니다. 최근 연속 실패 N회 · 잠금 N단계까지 진행 | [실패 기록 초기화] |

- "실패 기록 초기화"를 따로 둔 이유: 잠금이 끝나도 단계는 남아 있어서, 다음 5회 실패 때 30분·1시간부터 잠긴다. 관리자가 단계까지 되돌릴 수 있게 한다. (같은 API)
- 확인 창 없이 바로 처리한다. 해제는 되돌릴 일이 없는 안전한 동작이기 때문이다. (초기화·삭제는 확인 창 유지)
- 비밀번호 초기화도 서버에서 잠금을 함께 푼다. 그래서 초기화 성공 후 상세를 다시 불러와 잠금 표시를 맞추고, 설명 문구에 "로그인 잠금도 함께 풀립니다"를 추가했다.

## 2. 파일과 역할

| 파일 | 변경 |
|---|---|
| `services/api/auth.ts` | `unlockLogin(userId)` → `PATCH /auth/unlock/:userId`, 응답 `{ unlocked: boolean }` (잠긴 적이 없으면 false, 오류 아님) |
| `services/api/users.ts` | `AdminUserDetail.loginLock: LoginLockStatus \| null` 타입 추가 (`GET /users/:id` 응답) |
| `features/admin/components/users/user-danger-zone.tsx` | `LoginLockRow` 추가, `ActionRow`의 제목·설명을 ReactNode로(배지 표시), 비밀번호 초기화 성공 시 상세 무효화 |
| `features/admin/components/users/user-detail-view.tsx` | 계정 관리 섹션 설명 문구 |

## 3. 요청 흐름

```text
[잠금 해제] 클릭
 → useAdminUserMutation(() => unlockLogin(id))      // 기존 공용 변경 훅 (features/admin/hooks)
 → PATCH /api/auth/unlock/:id  (Next rewrite → NestJS, @Roles(ADMIN))
 → 성공: adminUserKeys.all 무효화 → GET /users/:id 다시 조회 → loginLock: null → 행이 "기록 없음"으로 바뀜
 → 토스트: unlocked ? "잠금을 해제했습니다" / "실패 기록을 초기화했습니다" : "이미 해제된 상태입니다"
```

- `isLocked`는 **서버가 응답한 시점** 기준이다. 화면을 열어 둔 채 잠금 시각이 지나도 자동으로 바뀌지 않는다. (다시 불러오면 맞춰짐 - 관리자 화면이라 실시간 갱신은 두지 않음)
- 모든 컴포넌트가 이미 Client Component(`"use client"`)인 화면이라 새 Server/Client 경계는 없다.

## 4. 확인 (2026-11-09)

- `tsc --noEmit`, ESLint(변경 파일) 통과
- Chrome + playwright-core(스크래치 폴더, 프로젝트 의존성 추가 없음)로 실제 로그인 → 상세 화면:
  잠김 표시·해제 → 토스트·기록 없음·버튼 비활성·DB 행 삭제·감사 로그 `LOGIN_UNLOCKED` / 기록만 있음 → [실패 기록 초기화] / 390px 다크 가로 넘침 없음
- 콘솔: 로그인 페이지 첫 진입의 `POST /api/auth/token/access` 401(쿠키 없는 세션 복구 시도, 기존 동작) 외 오류 없음

## 5. 설계 포인트
- 계정 기준 잠금은 남이 일부러 잠글 수 있다 → 최대 1시간 + 관리자 해제 경로를 둔 이유
- 해제 후 화면 갱신을 직접 상태로 고치지 않고 queryKey 무효화로 서버 값을 다시 받는 이유 (서버가 Source of Truth, 비밀번호 초기화처럼 다른 동작이 잠금을 바꿔도 같은 방식으로 맞춰짐)
