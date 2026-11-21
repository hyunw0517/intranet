# FE-01. 인증 (로그인·토큰 재발급·로그아웃)

> 상태: **구현 완료** (2026-10-23 설계, 2026-10-25 결정 반영·구현). 1~6장은 설계, 7장부터 구현된 구조 설명.
> FE-01 작업을 시작할 때 이 문서를 먼저 읽는다. 구현이 끝나면 아래에 "구조와 역할" 설명을 이어서 작성한다.
> 결정 배경은 [devlog](../devlog/2026-10-19.md) 2026-10-23 항목 3, 4, 4-1 참고.

## 1. 확정된 구조

- **access token**: 응답 본문으로 받아 **React 메모리**에만 둔다. localStorage·sessionStorage에 JWT를 저장하지 않는다.
- **refresh token**: NestJS가 **HttpOnly 쿠키**로 직접 내려준다(`Set-Cookie`). 프론트 JS는 이 값을 읽거나 다루지 않는다.
- 브라우저는 `/api/*`로만 호출한다. Next.js rewrite(운영은 Nginx)가 `/api`를 떼고 NestJS로 넘긴다. 같은 출처라 CORS 설정이 필요 없다.
- 처음 검토했던 Next.js Route Handler(BFF) 방식은 쓰지 않는다. `app/auth/` 같은 Route Handler 폴더를 만들지 않는다.

## 2. 백엔드 API 계약 (backend/src/auth 기준, 2026-10-23 확인)

| 브라우저 호출 경로 | 요청 | 성공 응답 | 비고 |
|---|---|---|---|
| `POST /api/auth/login/emp` | `Authorization: Basic base64(사번:비밀번호)` + JSON 본문 `{ rememberMe }` | `{ accessToken }` + refresh 쿠키 | 비밀번호에 `:` 포함 가능 (첫 `:` 기준 분리). `rememberMe: false`면 세션 쿠키로 발급, 값이 없으면 유지 |
| `POST /api/auth/register/emp` | JSON 본문 (`RegisterUserDto`) | `{ accessToken }` + refresh 쿠키 | 가입 즉시 로그인 상태 |
| `POST /api/auth/token/access` | 쿠키만 (Authorization 불필요) | `{ accessToken }` + **새 refresh 쿠키** | access 재발급 + refresh 교체(rotation, 2026-11-07~). 쿠키는 브라우저가 자동 저장하므로 프론트 변경 없음 |
| `POST /api/auth/token/refresh` | 쿠키만 | 본문 없음 + 새 refresh 쿠키 | `token/access`와 같은 교체 로직. 프론트는 호출하지 않음 |
| `POST /api/auth/logout` | 쿠키만 | `true` + 쿠키 삭제 | access 만료 상태에서도 호출 가능 (`@IsPublic`). **이 기기의 세션만** 폐기, 다른 기기는 유지 |
| `POST /api/auth/logout/all` | `Authorization: Bearer <access>` | `{ accessToken }` + 새 refresh 쿠키 | 모든 기기 로그아웃, **지금 기기만 유지** → 응답의 새 access token으로 교체해야 함 (화면 미구현) |
| `GET /api/auth/sessions` | `Authorization: Bearer <access>` | `[{ id, userAgent, createdAt, lastUsedAt, expiresAt, current }]` | 로그인된 기기 목록 (화면 미구현) |
| `DELETE /api/auth/sessions/:sessionId` | `Authorization: Bearer <access>` | `true` | 특정 기기 로그아웃. 없거나 남의 세션이면 404 (화면 미구현) |
| `PATCH /api/auth/change/pw` | `Authorization: Bearer <access>` + JSON 본문 | `{ accessToken }` + 새 refresh 쿠키 | 다른 기기는 `tokenVersion`으로 재발급 차단(access는 최대 10분 유효), 지금 기기만 유지 → **응답의 새 access token으로 교체해야 함** |
| 그 외 모든 API | `Authorization: Bearer <access>` | - | 전역 `AccessTokenGuard` (payload만 검증, DB 조회 없음 - 2026-11-07~) |

- **쿠키**: 이름 `refreshToken`, `HttpOnly`, `Path=/api/auth`, `SameSite=Lax`, `Secure`는 `PROTOCOL=https`일 때만, 유효시간 1일(재발급마다 연장, 로그인 후 최대 7일). 로그인 유지를 선택하지 않으면 `Max-Age` 없는 세션 쿠키
- 백엔드 구조 상세(세션 테이블, rotation, 재사용 감지)는 [../backend/jwt-auth.md](../backend/jwt-auth.md) 참고
- **access token 유효시간**: 10분
- **에러**
  - 401: 토큰 없음, 서명 오류, 만료, 토큰 종류 불일치(access ↔ refresh), 재발급 때 `tokenVersion` 불일치
  - 403: 권한 부족(payload의 `role` 기준), 로그인·재발급 때 회원 상태 문제(비활성, 퇴사) → **재발급을 시도하지 말고** 메시지를 보여 준 뒤 로그인 화면으로 보낸다
  - **2026-11-07부터** 일반 API는 회원 상태·`tokenVersion`을 확인하지 않는다. 퇴사·비활성·권한 변경·다른 기기의 비밀번호 변경은 access 만료(최대 10분) 후 재발급에서 반영된다. 재발급이 403이면 `refreshAccessToken`이 실패로 처리해 로그인 화면으로 가고, 다시 로그인할 때 403 메시지가 보인다(프론트 변경 없음).
  - 메시지는 NestJS 기본 형식 `{ statusCode, message, error }` (`ApiError.messages`로 변환됨)

## 3. 프론트 구현 방침

### 3.1 AuthProvider (`providers/`, Client Component)
- 상태: `accessToken`, 현재 사용자 정보, 상태값(`loading` / `authenticated` / `unauthenticated`)
- **앱 시작 시** `POST /api/auth/token/access`를 1회 호출한다.
  - 성공하면 `authenticated`
  - 401이면 `unauthenticated`
- 로그인, 로그아웃, 비밀번호 변경 결과를 이 상태에 반영한다.
- 헤더(사용자 이름, 로그아웃 버튼)는 이 상태를 **읽기만** 한다. 헤더에서 재발급 API를 부르지 않는다.

### 3.2 apiFetch (`services/api-client.ts`)
- 요청마다 메모리의 access token을 `Authorization: Bearer`로 붙인다.
- **401 처리**: `/token/access` 호출 → 새 토큰 저장 → 원래 요청 **1회만** 재시도 → 그래도 401이면 `unauthenticated`로 바꾸고 로그인 화면으로 보낸다.
- **동시 401 처리**: 여러 요청이 동시에 401을 받아도 재발급 요청은 하나만 보내고, 나머지는 그 결과를 기다렸다가 재시도한다.
- `/auth/*` 요청 자체가 401이면 재발급을 시도하지 않는다(무한 루프 방지).
- 403은 재발급 대상이 아니다.

### 3.3 페이지 접근 제어
- `(main)`, `admin` 레이아웃에서 AuthProvider 상태를 본다. (4장 결정에 따라 `proxy.ts`는 쓰지 않는다)
  - `loading`: 로딩 화면
  - `unauthenticated`: `/login`으로 이동
- **주의**: refresh 쿠키가 `Path=/api/auth`라서 `/`, `/admin` 같은 **페이지 요청에는 쿠키가 실리지 않는다.** 그래서 Next.js `proxy.ts`(서버)는 로그인 여부를 알 수 없다. 그래서 클라이언트(AuthProvider)에서만 판단한다.
- 관리자 화면은 사용자 `role`이 `ADMIN`일 때만 보여 준다. 최종 권한 검증은 백엔드 `RolesGuard`가 한다(프론트 숨김은 보안이 아님).

### 3.4 로그아웃
- `POST /api/auth/logout` 호출 → 메모리의 access token과 사용자 정보 제거 → `/login`으로 이동
- 서버는 이 기기의 세션만 폐기한다. 다른 기기의 로그인은 유지된다. 이 기기의 access token은 최대 10분 유효하지만 메모리에서 지우므로 문제없다.

## 4. 결정 사항 (2026-10-25 확정)

1. ~~**refresh token 연장 안 함**: `/token/refresh`는 호출하지 않는다. 로그인 1일 후 재로그인.~~
   → **변경(2026-11-07)**: 백엔드가 `/token/access` 응답에서 refresh도 교체(rotation)한다. 사용하는 동안 연장되고, 1일 동안 사용하지 않거나 로그인 후 7일이 지나면 재로그인. 프론트는 여전히 `/token/access`만 호출하면 된다.
   - 여러 탭이 동시에 재발급해도 백엔드가 직전 토큰을 1분간 허용하므로 탭 간 조율은 필요 없다.
2. **`proxy.ts`(서버 측 페이지 보호) 사용 안 함**: 로그인 여부와 권한은 클라이언트(AuthProvider)에서 판단한다.
3. **사용자 정보는 `GET /api/users/me`**로 조회한다. 앱 시작 시 access 재발급 직후 호출한다.
4. **회원가입 = 본인 가입 + 관리자 승인**
   - 가입 직후 GUEST로 로그인된다(백엔드가 토큰·쿠키 발급, `role` 기본값 GUEST).
   - GUEST는 `(main)`의 업무 화면 대신 "관리자 승인 대기" 화면을 본다. **마이페이지는 GUEST도 접근 가능.**
   - 프론트에서 가리는 것일 뿐이므로, 업무 API에는 백엔드에서 `@Roles(UserRole.USER)`로 GUEST를 거부해야 한다(각 기능 구현 시).
5. **로그인 화면**: 로그인하지 않았으면 로그인 화면을 표시한다. 폼 아래에 "아이디·비밀번호를 잊으셨나요?" 링크(안내 다이얼로그)와 회원가입 버튼을 둔다.
   - 백엔드에 찾기 기능이 없으므로 다이얼로그에서 "사번은 인사팀, 비밀번호는 관리자에게 초기화 요청" 안내만 한다. 메일 재설정은 나중에 개선(Plan.md).
6. **관리자 화면(`/admin`)은 ADMIN만 접근 가능.** 그 외는 권한 없음 안내. 사이드바의 "관리자 화면으로" 링크도 ADMIN에게만 보인다. 최종 검증은 백엔드 `RolesGuard`.

## 5. 화면 범위 (초안)
- `(auth)/login`: 사번, 비밀번호 입력, 오류 메시지(401/403 구분), 제출 중 버튼 비활성화
- 헤더 사용자 메뉴: 이름, 로그아웃
- (결정 시) `(auth)/register`, 마이페이지 비밀번호 변경

## 6. Postman 테스트 참고
- 3100번으로 직접 호출하면 쿠키 경로(`/api/auth`)가 맞지 않아 쿠키가 자동으로 붙지 않는다. `Cookie: refreshToken={{refreshToken}}` 헤더를 직접 넣거나, 프론트 dev 서버(3000)의 `/api/...`로 호출한다.
- 재발급 API에는 Authorization이 필요 없다(`No Auth`).

---

## 7. 구현 결과: 구조와 역할 (2026-10-25)

### 7.1 파일 구조

```text
src/
├── services/
│   ├── api-client.ts               # access token 메모리 보관, Bearer 헤더, 401 → 재발급 1회 → 재시도
│   └── api/
│       ├── auth.ts                 # auth.controller 대응: 로그인(Basic), 가입, 로그아웃, 비밀번호 변경 + 요청 타입
│       └── users.ts                # users.controller 대응: 내 정보 조회·수정 + 요청 타입
├── types/user.ts                   # CurrentUser, UserRole 등 여러 화면이 쓰는 응답 타입
├── providers/
│   ├── auth-provider.tsx           # 로그인 상태(Context): 앱 시작 시 재발급 + /users/me, login/register/logout
│   └── app-providers.tsx           # Theme > Query > Auth > Tooltip 순서로 감쌈
├── features/
│   ├── auth/
│   │   ├── safe-redirect.ts        # ?next= 검증 (오픈 리다이렉트 방지)
│   │   ├── guards/                 # 접근 제어 (app 레이아웃이 가져다 씀)
│   │   │   ├── auth-gate.tsx       # 로그인 필요 → 아니면 /login?next=현재경로
│   │   │   ├── guest-only-gate.tsx # 로그인·가입 화면: 이미 로그인했으면 next로 이동
│   │   │   └── role-gate.tsx       # PendingApprovalGate(승인 대기 안내), AdminGate(ADMIN만)
│   │   └── components/             # auth 화면 전용
│   │       └── login-form.tsx / register-form.tsx / find-account-dialog.tsx
│   └── mypage/components/          # mypage-view(계정 정보), profile-form(정보 수정), change-password-form,
│                                   # current-password-dialog(저장 직전 현재 비밀번호 확인 모달, 두 폼 공용)
├── components/
│   ├── common/form-field.tsx       # 라벨·입력·오류 묶음, 서버 오류 표시
│   ├── common/full-page-loader.tsx
│   └── layout/user-menu.tsx        # 헤더 사용자 메뉴(이름·권한·마이페이지·로그아웃)
├── lib/
│   ├── error-message.ts            # ApiError → 화면 문장
│   └── validation/user.ts          # 회원 입력 규칙 (백엔드 DTO와 같은 규칙, 가입·마이페이지 공용)
└── app/
    ├── (auth)/layout.tsx           # Suspense > GuestOnlyGate
    ├── (auth)/login, register      # 페이지는 폼 컴포넌트만 렌더링
    ├── (main)/layout.tsx           # AuthGate > AppShell > PendingApprovalGate
    ├── (main)/mypage/page.tsx
    └── admin/layout.tsx            # AuthGate > AdminGate > AppShell
```

### 7.2 로그인 상태가 정해지는 흐름

```text
앱 시작(새로고침)
  AuthProvider ─ POST /api/auth/token/access (쿠키 자동 전송)
     ├ 성공 → access token 메모리 저장 → GET /api/users/me → status = authenticated
     └ 실패 → status = unauthenticated
  AuthGate ─ loading: 로더 / unauthenticated: /login?next=… / authenticated: 화면 표시
  PendingApprovalGate ─ role === GUEST && 경로 ≠ /mypage → "관리자 승인 대기" 안내
  AdminGate ─ role ≠ ADMIN → "접근 권한이 없습니다"

API 호출 중 401
  apiFetch ─ refreshAccessToken() → 성공: 같은 요청 1회 재시도
                                  └ 실패: onSessionExpired → AuthProvider.clearSession → AuthGate가 /login으로
```

- **access token은 `api-client.ts`의 모듈 변수**에 있다. React state가 아니라서 바뀌어도 화면이 다시 그려지지 않고, 모든 요청이 같은 값을 쓴다. 화면이 알아야 하는 것(로그인 여부, 사용자 정보)만 AuthProvider의 state에 둔다.
- **재발급 중복 방지**: `refreshPromise` 하나를 공유한다. 동시에 여러 요청이 401이면 첫 요청만 재발급 API를 부르고 나머지는 같은 Promise를 기다린다. (개발 모드 StrictMode에서 effect가 두 번 실행돼도 재발급은 1회)
- `/auth/*` 요청과 `skipAuth` 요청(로그인·가입·로그아웃)은 401이어도 재발급하지 않는다. 재발급 자체가 401이면 무한 반복되기 때문이다.
- 로그아웃·세션 만료 시 `queryClient.clear()`로 이전 사용자의 캐시를 지운다.

### 7.3 Server / Client Component 구분

| 파일 | 종류 | 이유 |
|---|---|---|
| `(main)/layout.tsx`, `admin/layout.tsx`, 페이지 파일 | Server | 조합만 한다. 상태 없음 |
| `AppShell` | Server | 사이드바 접힘 쿠키(`cookies()`)를 서버에서 읽음 |
| `AuthGate`, `PendingApprovalGate`, `AdminGate`, 폼, `UserMenu` | Client | 로그인 상태(Context), 라우터, 입력 상태 필요 |

- Client인 `AuthGate`가 Server인 `AppShell`을 `children`으로 감싸는 구조다. Client가 Server를 **import할 수는 없지만, children으로 받을 수는 있다.**
- `(auth)/layout.tsx`의 `GuestOnlyGate`는 `useSearchParams()`를 쓰므로 `<Suspense>`로 감싼다. 감싸지 않으면 `next build`가 실패한다.

### 7.3-1 마이페이지 본인 확인 모달 (2026-10-25 변경)

- 폼에 "현재 비밀번호" 칸을 두지 않고, **[저장] / [비밀번호 변경]을 누르면 입력값 검증 → 현재 비밀번호 모달 → 확인 시 요청** 순서로 동작한다.
- 오류 표시 위치
  - 내 정보 수정: 저장 요청의 오류는 모두 모달 안에 표시한다. 현재 비밀번호 불일치와 이메일 중복이 둘 다 400이라 상태 코드로 구분할 수 없기 때문이다. 폼을 고쳐야 하는 오류면 [취소]로 닫고 수정하며, 닫을 때 오류 메시지도 지운다.
  - 비밀번호 변경: 오류가 모두 비밀번호에 관한 것이라 모달 안에 표시한다. "새 비밀번호 = 현재 비밀번호"는 요청 전에 모달에서 바로 알려 준다(서버도 400으로 검사).
- 모달 내용은 열릴 때마다 새로 마운트되어 이전 입력값이 남지 않는다. 취소해도 폼 입력값은 유지된다.
- ~~백엔드 개선 후보: 현재 비밀번호 불일치가 401이라 apiFetch가 토큰 만료로 오해해 재발급·재시도를 한 번 더 함~~ → **해결(`f94fb55`)**: `verifyPassword(user, pw, purpose)`에 `'login' | 'confirm'` 인자를 추가해 로그인은 401, 본인 확인(정보 수정·비밀번호 변경·탈퇴)은 400. 이제 재발급 요청이 나가지 않는다(확인함).

### 7.3-2 로그인 유지 체크박스 (2026-11-18)

- `login-form.tsx`의 "로그인 유지" 체크박스, **기본 해제**. 값은 `useAuth().login(empNo, password, rememberMe)` → `services/api/auth.ts`의 `login` → `POST /api/auth/login/emp` 본문으로 전달한다.
- 프론트는 쿠키를 직접 다루지 않는다. 쿠키 방식은 서버가 정하며, 재발급 흐름도 바뀌지 않는다.
- 탭을 닫거나 새로고침해도 로그인은 유지되고, 브라우저 창을 모두 닫아야 세션 쿠키가 사라진다. 이전 세션 복원·백그라운드 실행을 켠 브라우저는 쿠키가 남을 수 있다.
- 회원가입 화면에는 체크박스가 없고, 가입 직후 자동 로그인은 유지로 처리한다.
- 서버 동작은 [jwt-auth.md](../backend/jwt-auth.md) 5.9 참고.

### 7.4 보안 관련 처리

- **로그인 실패 메시지 통일**: 401이면 원인과 관계없이 "사번 또는 비밀번호가 올바르지 않습니다." 백엔드는 "존재하지 않는 사용자입니다"처럼 구분해서 응답하는데, 그대로 보여 주면 등록된 사번을 알아내는 데 쓰일 수 있다. (백엔드 메시지도 통일하는 것이 더 낫다 → 추후 개선 후보)
- **오픈 리다이렉트 방지**: `?next=//evil.com`처럼 외부로 해석되는 값은 무시하고 `/`로 보낸다.
- **Basic 인증 인코딩**: `btoa`는 한글 등 Latin1 밖의 문자를 처리하지 못하므로 `TextEncoder`로 UTF-8 바이트를 만든 뒤 인코딩한다(백엔드는 utf8로 디코딩).
- **비밀번호 변경 후 토큰 교체**: 서버가 `tokenVersion`을 올려 기존 토큰이 모두 무효가 되므로 응답의 새 access token으로 바로 교체한다. 새 refresh 쿠키는 서버가 저장한다.
- 화면 가림(PendingApprovalGate, AdminGate)은 보안이 아니다. 실제 차단은 백엔드 가드(`AccessTokenGuard`, `RolesGuard`)가 한다.

### 7.5 검증 (2026-10-25, Playwright로 실제 백엔드에 연결해 확인)

| 항목 | 결과 |
|---|---|
| 비로그인 `/` 접근 → `/login?next=%2F` | ✅ |
| 빈 값·형식 검증, 잘못된 로그인 메시지 | ✅ |
| 아이디·비밀번호 찾기 안내 다이얼로그 | ✅ |
| 가입 → GUEST로 로그인 → 승인 대기 화면, 메뉴는 마이페이지만, 관리자 링크 숨김 | ✅ |
| GUEST의 `/admin` 접근 → 권한 없음 | ✅ |
| 마이페이지 정보 수정(현재 비밀번호 필수, 휴대폰 하이픈 제거) | ✅ |
| 저장·비밀번호 변경 시 현재 비밀번호 모달: 빈 값·불일치 오류는 모달 안, 취소 시 입력 유지, 성공 시 닫힘, 모바일 표시 | ✅ |
| 새로고침 후 로그인 유지 (재발급 1회) | ✅ |
| 401 응답 1회 가로채기 → 재발급 → 재시도 성공 | ✅ |
| 비밀번호 변경 후 계속 사용 + 새로고침 유지 | ✅ |
| 로그아웃 후 새로고침해도 로그아웃 상태 | ✅ |
| 로그인 후 `?next=` 경로로 복귀, `//evil.com`은 `/`로 | ✅ |
| 390px 모바일 가로 넘침 없음 | ✅ |
| lint, build | ✅ |

- USER·ADMIN 계정 화면(대시보드, 관리자 홈 진입)은 승인 권한이 있는 관리자 계정으로 직접 확인이 필요하다.

### 7.6 설계 포인트
1. access token을 React state가 아닌 모듈 변수에 둔 이유는? (요청마다 같은 값을 쓰고, 값이 바뀌어도 화면을 다시 그릴 필요가 없음)
2. 여러 요청이 동시에 401을 받으면? (재발급 Promise 공유)
3. 새로고침하면 로그인이 어떻게 유지되나? (HttpOnly 쿠키 → 앱 시작 시 재발급)
4. 승인 전 회원(GUEST)은 어떻게 막았나? (화면은 PendingApprovalGate, 실제 차단은 백엔드 `@Roles` - 업무 API 구현 시 적용)
5. 로그인 실패 시 메시지를 왜 하나로 통일했나? (계정 존재 여부 노출 방지)
6. `?next=` 리다이렉트에서 주의한 점은? (오픈 리다이렉트)
7. 로그인 유지를 체크하지 않았을 때 브라우저를 닫으면 로그아웃되는 원리는? (Max-Age 없는 세션 쿠키 + 메모리의 access token)
