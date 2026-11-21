# JWT 인증 구조 (Access · Refresh · 로그인 세션)

> 작성일: 2026-11-07 · 복습용 상세 문서
> 프론트 연동(쿠키, 401 처리, AuthProvider)은 [fe-01-auth.md](../frontend/fe-01-auth.md), 결정 과정은 [devlog](../devlog/2026-11-02.md)의 2026-11-07 항목을 참고한다.
> 이 문서의 값(시간, 경로)은 작성 시점 코드 기준이다. 코드가 바뀌면 코드가 우선이다.

---

## 0. 한 장 요약

```text
① 로그인      POST /auth/login/emp  (Authorization: Basic 사번:비밀번호, 본문 { rememberMe })
              → 세션(AuthSession) 1행 생성 (rememberMe 저장)
              ← access token(응답 본문) + refresh token(HttpOnly 쿠키)

② API 호출    Authorization: Bearer <access>
              → AccessTokenGuard: 서명·만료 → type=access → payload로 req.user(id·role) 구성
              (회원·세션 DB를 보지 않음 = stateless. 권한·상태·비밀번호 변경은 최대 10분 늦게 반영)

③ 재발급      401 → POST /auth/token/access (쿠키 자동 전송)
              → RefreshTokenGuard: 서명·만료 → 회원 조회 → ver 일치 → 상태 → type=refresh
              → AuthSessionsService.rotateSession: sid로 세션 조회 → jti 비교
                   jti == current            → 새 jti로 교체 (rotation)
                   jti == previous, 1분 이내 → 다른 탭의 동시 요청, 현재 jti로 발급
                   그 외                      → 재사용 감지 → 세션 폐기 → 401
              ← 새 access + 새 refresh 쿠키

④ 끊기        로그아웃               → 이 기기의 세션만 폐기
              기기 로그아웃          → 지정한 세션만 폐기
              모든 기기 로그아웃      → tokenVersion +1 (refresh 즉시 무효, access는 만료까지) + 지금 기기만 갱신
              비밀번호 변경          → 위와 같음
              관리자 비번 초기화·삭제 → tokenVersion +1 (대상 회원 전부 끊김, access는 만료까지)
              퇴사·비활성·권한 변경   → 다음 재발급에서 반영 (최대 10분)
```

기억할 원칙 다섯 가지:

1. **access는 stateless, refresh는 stateful.** 일반 API는 DB 조회 없이 서명만 검증하고, 폐기가 필요한 긴 수명의 토큰만 서버가 기억한다.
2. **JWT 검증(서명·만료)과 업무 검증(ver·상태·세션)은 다른 계층이다.** `jwtService.verify()`는 "우리가 만든 토큰인지"만 안다.
3. **access는 payload를 믿고, 주인의 현재 상태는 재발급 때 DB로 확인한다.** payload는 발급 당시 값이라, 권한·상태 변경은 access 만료(최대 10분)까지 늦게 반영된다. (2026-11-07 결정: 10분 지연은 허용)
4. **이미 쓴 refresh token이 다시 오면 탈취 신호다.** 정상 사용자는 항상 최신 토큰만 갖고 있기 때문이다.
5. **끊는 수단은 두 단계다.** 기기 하나는 세션 폐기, 전부는 `tokenVersion`.

---

## 1. 파일 구성

```text
backend/src/auth/
├── auth.controller.ts          # 라우트: 로그인·가입·재발급·로그아웃·전체 로그아웃·기기 목록·비밀번호
├── auth.service.ts             # 토큰 서명(signAccessToken / signRefreshToken / issueTokens), 검증(verifyToken)
├── auth-sessions.service.ts    # 세션 생성·교체(rotation)·재사용 감지·폐기·목록·정리  ← 핵심
├── auth.module.ts
├── const/
│   ├── token-const.ts          # 시간 정책 (access 10분, refresh 1일, 세션 7일, 유예 1분)
│   └── refresh-cookie-const.ts # 쿠키 옵션·저장·삭제
├── types/
│   └── jwt-payload.type.ts     # JwtPayload (sub, empNo, type, ver, role, perms, sid, jti, iat, exp) + TokenUserPayload(req.user)
├── decorator/
│   ├── user.decorator.ts       # @User()     → req.user
│   └── session-id.decorator.ts # @SessionId() → req.sessionId (access token의 sid)
└── guard/
    ├── basic-token.guard.ts    # 로그인: Basic 헤더 → 사번/비밀번호 검증
    └── bearer-token.guard.ts   # authenticateAccess()(payload만) / authenticate()(DB 조회) + AccessTokenGuard(전역) + RefreshTokenGuard

backend/prisma/schema.prisma    # model AuthSession
backend/src/users/users.service.ts
    # increaseTokenVersion (전체 로그아웃), updatePassword (비밀번호 변경·초기화 시 tokenVersion +1),
    # getMyInfo (GET /users/me - req.user가 payload라 회원 정보는 여기서 조회)
```

---

## 2. JWT 기초 - 우리 토큰은 어떻게 생겼나

JWT = `Base64URL(header).Base64URL(payload).Base64URL(signature)`

### 2.1 Header

```json
{ "alg": "HS256", "typ": "JWT" }
```

- **HS256** = HMAC-SHA256. 서명과 검증에 같은 키(`JWT_SECRET`)를 쓰는 **대칭키** 방식이다.
- `verifyToken()`은 `algorithms: ['HS256']`으로 **서버가 허용할 알고리즘을 정한다.** 헤더의 `alg`를 믿으면 `alg: none`(서명 없는 토큰) 같은 위조를 통과시킬 수 있기 때문이다. (jsonwebtoken 9는 기본으로도 막지만, 의도를 코드에 드러낸다.)

### 2.2 Payload

| 클레임 | access | refresh | 의미 |
|---|---|---|---|
| `sub` | ✅ | ✅ | 회원 id (JWT 표준 "subject") |
| `empNo` | ✅ | ✅ | 사번 (재발급 때 가드가 이 값으로 회원 조회) |
| `type` | `"access"` | `"refresh"` | 토큰 용도. 같은 키로 서명하므로 이것으로 구분한다 |
| `ver` | ✅ | ✅ | 발급 당시 `Users.tokenVersion`. **재발급 때** DB 값과 다르면 무효 (access 검증에서는 비교하지 않음) |
| `role` | ✅ | - | 발급 당시 권한. `RolesGuard`가 이 값을 쓴다. 재발급 때 DB의 최신 값으로 다시 들어감 |
| `perms` | ✅ | - | 발급 당시 관리자 기능(`Users.adminPermissions`, ADMIN만 값이 있음). `RolesGuard`의 `@RequireAdmin` 판단과 서비스 분기에 쓴다 (features.md 5.1) |
| `sid` | ✅ | ✅ | 세션 id (`AuthSession.id`). access에서는 "지금 기기" 식별용 |
| `jti` | - | ✅ | refresh token 고유 id. `AuthSession.currentJti`와 비교 |
| `iat` / `exp` | ✅ | ✅ | 발급/만료 시각(초). 라이브러리가 자동으로 넣는다 |

- payload는 **서명은 되지만 암호화되지 않는다.** Base64URL 디코딩만 하면 누구나 읽는다. → 비밀번호, 개인정보는 넣지 않는다.
- payload를 고치면 서명이 깨지므로 **위조는 불가능**하다. 그래서 `type`, `ver`, `role`, `sid`, `jti`를 믿고 쓸 수 있다. (`role`을 `ADMIN`으로 바꿔도 서명이 깨져 401)

### 2.3 Signature

```text
HMACSHA256( base64Url(header) + "." + base64Url(payload), JWT_SECRET )
```

- 키가 약하면 토큰 하나로 **오프라인 대입 공격**이 가능하다(hashcat 모드 16500). 키를 알면 공격자가 관리자 토큰을 직접 서명할 수 있어 **모든 검사가 무력화**된다.
- `JWT_SECRET`은 48바이트 이상 랜덤 값으로 만든다.
  - PowerShell: `$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)`
  - Git Bash: `openssl rand -base64 48`

---

## 3. 토큰이 두 개인 이유와 전달 방식

| | Access Token | Refresh Token |
|---|---|---|
| 용도 | API 호출 | access 재발급 |
| 수명 | 10분 | 1일(유휴), 세션 최대 7일 |
| 저장 | 프론트 **메모리** | **HttpOnly 쿠키** |
| 전송 | `Authorization: Bearer` (프론트가 직접 붙임) | 브라우저가 자동 전송 (`Path=/api/auth`) |
| 서버 검증 | stateless (**DB 조회 없음**, payload만) | stateful (회원 + **세션 조회**) |
| 폐기 | 못 함 (만료 대기, 최대 10분) | 세션 폐기·`tokenVersion`으로 즉시 |

- **수명이 짧은 토큰을 자주 쓰고, 수명이 긴 토큰은 드물게 쓴다.** 자주 쓰는 access가 새어도 10분이면 끝나고, 오래 사는 refresh는 노출 경로(인증 라우트)를 최소화한다.
- **쿠키 옵션** (`refresh-cookie-const.ts`)
  - `httpOnly`: JS에서 읽을 수 없음 → XSS로 refresh token을 훔칠 수 없음
  - `path: '/api/auth'`: 인증 라우트에만 실림 → 일반 API·페이지 요청에는 안 실림
  - `sameSite: 'lax'`: 다른 사이트의 POST에는 안 실림 → CSRF 완화
  - `secure`: `PROTOCOL=https`일 때만 → https에서만 전송
  - `maxAge`: 로그인 유지를 선택하면 refresh token의 남은 유효시간과 같게 맞춘다. 선택하지 않으면 넣지 않아 세션 쿠키가 된다(5.9)
- access를 메모리에만 두므로 **새로고침하면 사라진다.** 앱 시작 시 `/token/access`를 한 번 호출해 쿠키로 다시 받는다.

---

## 4. 검증 계층 - 누가 무엇을 확인하나

```text
요청 ─┬─ AccessTokenGuard (전역, APP_GUARD)                     ← DB 조회 없음
      │    └─ BearerTokenGuard.authenticateAccess()
      │         ① verifyToken: 서명·만료·알고리즘           ← JWT 계층
      │         ② type === 'access', role 있음 (아니면 401)
      │         ③ req.user = { id: sub, empNo, role, tokenVersion: ver } (payload 그대로)
      │    └─ RolesGuard: req.user.role로 권한 판단
      │
      └─ RefreshTokenGuard (재발급 라우트만)                    ← 여기서만 회원 조회
           └─ 쿠키에서 꺼냄 → BearerTokenGuard.authenticate()
                ① verifyToken
                ② empNo로 회원 조회 (없으면 401)
                ③ payload.ver === user.tokenVersion (아니면 401)
                ④ checkUserStatus: ACTIVE만 (아니면 403)
                ⑤ req.user = DB 회원 (→ 새 access token에 최신 role)
           └─ type === 'refresh'
           └─ (컨트롤러) AuthService.reissueTokens
                └─ AuthSessionsService.rotateSession       ← 세션 계층
                     ⑥ sid로 살아 있는 세션 조회 (없으면 401)
                     ⑦ jti 비교 → 교체 / 유예 / 재사용 감지
```

- **`@IsPublic()` 라우트**: 전역 가드가 검증을 건너뛴다. 단 토큰이 함께 오면 `authenticateAccess()`로 검증해 `req.user`를 채운다(실패해도 비로그인 취급). refresh token은 로그인으로 인정하지 않는다.
- **`req.user`는 payload다.** 컨트롤러가 `@User()`로 쓰는 값은 `id`·`role`·`tokenVersion`뿐이다. 이름·부서 등 회원 정보가 필요하면 서비스가 DB에서 조회한다(예: `GET /users/me` → `UsersService.getMyInfo`).

### 4.0 access 검증에서 DB 조회를 뺀 이유 (2026-11-07)

| | 요청마다 회원 조회 (이전) | payload만 (현재) |
|---|---|---|
| 일반 API 비용 | 요청마다 쿼리 1회 | 쿼리 없음 |
| 권한 변경·퇴사·비활성 | 다음 요청부터 반영 | 다음 재발급부터 (최대 10분) |
| 비밀번호 변경·모든 기기 로그아웃 | 다른 기기 access 즉시 401 | 다른 기기 access는 만료까지 유효, refresh는 즉시 401 |

- 요청마다 회원을 조회하면 JWT를 쓰는 이점(저장소 조회 없는 검증)이 사라져 세션 방식과 비용이 같아진다.
- 10분 지연은 사내 시스템에서 허용 가능하다고 판단했다(사용자 결정). 즉시 반영이 필요한 상황이 생기면 access 만료를 줄이거나 짧은 캐시와 함께 조회를 되살리는 방법이 있다.
- **재발급 라우트는 `@IsPublic()` + `@UseGuards(RefreshTokenGuard)`**: 전역 access 검사를 건너뛰되 refresh 검사는 반드시 한다. `RefreshTokenGuard`는 public 여부와 상관없이 `authenticate()`를 호출한다. (예전에 이 부분이 빠져 퇴사자도 재발급되던 버그가 있었다 → docs/portfolio.md)

### 4.1 `type` 클레임이 막는 것

같은 `JWT_SECRET`으로 서명하므로 서명만으로는 access와 refresh를 구분할 수 없다.

| 검사가 없으면 | 결과 |
|---|---|
| refresh를 `Bearer`로 일반 API에 사용 | 10분짜리 권한이 1일로 늘어남 |
| access를 쿠키에 넣어 재발급 | 탈취한 access 하나로 계속 연장 |

검사 위치: `AccessTokenGuard`(access만), 공개 라우트(access만 로그인 인정), `RefreshTokenGuard`(refresh만), `reissueTokens`(refresh만, 이중 확인).

---

## 5. 흐름별 상세

### 5.1 로그인 / 가입

```text
BasicTokenGuard: Basic 헤더 디코딩 → 첫 ':' 기준 분리 → 비밀번호 검증 → 상태 확인 → req.user
AuthService.loginUser(user, userAgent)
  └─ AuthSessionsService.createSession
       ├─ deleteDeadSessions: 이 사용자의 끝난 세션 삭제 (폐기·만료·유휴·ver 불일치)
       └─ INSERT AuthSession { userId, tokenVersion, currentJti: uuid, userAgent, expiresAt: now+7일 }
  └─ issueTokens: access(sid) + refresh(sid, jti, exp=min(1일, 세션 남은 시간))
컨트롤러: refresh → Set-Cookie, access → 응답 본문
```

### 5.2 재발급과 rotation (정상)

```text
세션: currentJti = J1
클라이언트: refresh(J1) → /token/access
  rotateSession: J1 == currentJti
    UPDATE ... SET previousJti=J1, currentJti=J2, rotatedAt=now, lastUsedAt=now
           WHERE id=sid AND currentJti=J1 AND revokedAt IS NULL   ← count 확인
  → refresh(J2) 쿠키 + 새 access
```

- `WHERE currentJti = J1`을 다시 거는 이유: 두 요청이 동시에 들어오면 둘 다 "J1이 현재"라고 읽을 수 있다. UPDATE 조건에 다시 걸면 **한쪽만 성공(count 1)**하고 다른 쪽은 count 0이 된다. 실패한 쪽은 세션을 다시 읽어 5.3(유예) 규칙으로 판단한다. (일괄 처리의 경쟁 상태와 같은 패턴 - "검증은 메시지용, WHERE는 무결성용")
- 재발급할 때마다 refresh 수명이 다시 1일이 되므로 **쓰는 동안 로그인이 유지**되고, `expiresAt`(7일)은 바뀌지 않으므로 **무한 연장은 안 된다.**

### 5.3 여러 탭 동시 재발급 (유예 시간)

```text
탭1, 탭2 모두 쿠키 refresh(J1)을 갖고 있음 (쿠키는 탭끼리 공유)
탭1: J1 → 교체 성공 → J2 (쿠키 갱신)
탭2: (거의 동시에) J1 → 이미 previousJti
     rotatedAt 후 1분 이내 → 교체하지 않고 현재 J2로 토큰 발급
```

- 프론트의 `refreshPromise`는 **한 탭 안에서만** 중복 요청을 막는다. 탭 사이는 서버가 처리한다.
- 유예가 없으면 정상 사용자가 탭을 두 개 열었다는 이유만으로 "탈취"로 판정되어 로그아웃된다.
- 트레이드오프: 교체 후 1분 안에 직전 토큰을 쓰는 공격자도 통과한다. 대신 그 공격자도 결국 같은 세션의 최신 토큰을 받게 되므로, 이후 어느 쪽이든 옛 토큰을 내미는 순간 5.4로 감지된다.

### 5.4 재사용 감지 (탈취 대응)

```text
공격자가 refresh(J1)을 복사해 감
사용자: J1 → J2 → J3 ... 계속 사용
공격자: J1 사용 → J1은 currentJti도 아니고, previousJti(1분 이내)도 아님
        → 세션 폐기(revokedAt) → 401 "보안을 위해 로그아웃되었습니다"
사용자: 다음 재발급(J3) → 세션이 폐기됨 → 401 → 재로그인
```

- 서버는 **누가 공격자인지 구분할 수 없다.** 그래서 세션을 통째로 끊는다. 정상 사용자는 다시 로그인하면 되고, 공격자는 비밀번호가 없어 다시 들어올 수 없다.
- 반대로 공격자가 먼저 J1 → J2로 교체해도, 사용자가 J1을 내미는 순간 같은 방식으로 감지된다.
- 다른 기기의 세션은 영향받지 않는다. (권장 결정: "그 세션만 폐기")

### 5.5 로그아웃 (이 기기만)

```text
POST /auth/logout (@IsPublic - access가 만료돼도 호출 가능)
  ① 쿠키 삭제 (먼저 - DB가 실패해도 이 기기는 로그아웃)
  ② 쿠키의 refresh 검증 → sid → 세션 revokedAt = now
     (쿠키가 없거나 무효이면 아무것도 안 하고 성공)
```

- 이 기기의 access token은 최대 10분 유효하지만 프론트가 메모리에서 지운다.
- 탈취된 refresh token은 **같은 sid**를 갖고 있으므로 이 로그아웃으로 함께 무효가 된다. (예전 구조에서는 쿠키만 지워서 복사본이 1일간 살아 있었다)

### 5.6 모든 기기에서 로그아웃 / 비밀번호 변경 (지금 기기만 유지)

```text
POST /auth/logout/all, PATCH /auth/change/pw   (access 필요)
  ① Users.tokenVersion +1          → 모든 기기의 refresh가 다음 재발급에서 401 (RefreshTokenGuard의 ver 비교)
  ② renewSession(지금 sid)         → 지금 세션의 tokenVersion·currentJti 갱신 (previousJti는 비움)
  ③ 새 access + 새 refresh 발급     → 프론트는 응답의 access로 교체해야 함
```

- 다른 기기에 이미 발급된 **access token은 만료(최대 10분)까지 유효**하다. access 검증이 DB를 보지 않기 때문이다. 그 뒤 재발급이 막혀 로그아웃된다.
- `tokenVersion`을 쓰는 이유: 다른 세션 행을 일일이 폐기하지 않아도 사용자 전체의 refresh가 한 번에 막힌다.
- 지금 기기의 sid는 access token payload에서 꺼낸다(`@SessionId()`). 세션을 못 찾으면(세션 도입 전 토큰 등) 새 세션을 만든다.

### 5.7 기기 목록 / 기기별 로그아웃

```text
GET    /auth/sessions              → 살아 있는 세션 목록 + current(지금 기기 여부)
DELETE /auth/sessions/:sessionId   → 본인 세션만 폐기 (없거나 남의 것이면 404)
                                     지금 기기를 지정하면 쿠키도 삭제
```

- 기기 로그아웃은 refresh만 끊는다. 그 기기의 access는 최대 10분 유효하다. (stateless의 대가, 6장)

### 5.8 관리자가 끊는 경우

| 동작 | 방법 | 결과 |
|---|---|---|
| 비밀번호 초기화 | `updatePassword` → `tokenVersion` +1 | 대상 회원의 모든 기기가 다음 재발급에서 401 (access는 최대 10분 유효) |
| 회원 삭제 / 복구 | `tokenVersion` +1 | 삭제 후 재발급 401, 삭제 전 토큰이 복구 후 되살아나지 않음 |
| 상태 변경(퇴사·비활성) | 재발급 때 `status` 확인 | access 만료까지(최대 10분) 사용 가능 → 재발급 403 |
| 권한 변경(가입 승인 등) | 재발급 때 DB의 `role`로 새 access 발급 | 최대 10분 뒤 반영 (승인된 회원은 새로고침 시 앱 시작 재발급으로 바로 반영) |
| 관리자 권한 회수·강등 | `tokenVersion` +1 (기능 추가는 위와 같이 재발급 때 반영) | 다음 재발급에서 401 → 다시 로그인 (access는 최대 10분 유효) |

### 5.9 로그인 유지 (2026-11-18)

```text
POST /auth/login/emp  본문 { rememberMe: false }
  → AuthSession.rememberMe = false
  → issueTokens: refreshTokenMaxAge = undefined
  → Set-Cookie: refreshToken=...; Path=/api/auth; HttpOnly; SameSite=Lax   (Max-Age 없음 = 세션 쿠키)

브라우저를 완전히 닫음 → 세션 쿠키 삭제, 메모리의 access token도 사라짐 → 다시 열면 재발급 401 → 로그인 화면
```

| 경로 | `rememberMe` |
|---|---|
| 로그인 | 본문 값. 없으면 `true` |
| 회원가입 직후 자동 로그인 | `true` |
| 재발급(`rotateSession`) | 세션에 저장된 값 |
| 비밀번호 변경·모든 기기 로그아웃(`renewSession`) | 세션에 저장된 값. 세션을 찾지 못해 새로 만들면 `false` |

- **세션 행에 저장한 이유**: refresh 쿠키는 재발급마다 다시 내려간다. 선택을 기억하지 않으면 첫 재발급(최대 10분 뒤)에 일반 쿠키로 바뀐다. 비밀번호 변경·모든 기기 로그아웃은 access token으로 요청이 오므로 refresh payload보다 세션 행이 공통으로 읽기 쉽다.
- 컬럼 기본값이 `true`라 마이그레이션 전에 만든 세션의 동작은 바뀌지 않는다.
- 서버 쪽 만료(유휴 1일·절대 7일)는 체크 여부와 무관하다. 서버는 브라우저 종료를 알 수 없어 세션 행은 유휴 만료까지 남는다.

---

## 6. `AuthSession` 테이블

```prisma
model AuthSession {
  id           String    @id @default(uuid()) @db.Uuid   // = payload.sid
  userId       Int
  tokenVersion Int       // 발급 당시 Users.tokenVersion
  currentJti   String    @db.Uuid    // 현재 유효한 refresh의 jti
  previousJti  String?   @db.Uuid    // 직전 jti (유예 판단)
  rotatedAt    DateTime?             // 마지막 교체 시각 (유예 기준)
  userAgent    String?               // 기기 목록 표시
  lastUsedAt   DateTime              // 마지막 재발급 (유휴 만료 기준)
  expiresAt    DateTime              // 절대 만료 (로그인 + 7일)
  revokedAt    DateTime?             // 폐기 시각
  rememberMe   Boolean @default(true) // 로그인 유지 (false면 세션 쿠키로 발급)
  createdAt    DateTime
}
```

**살아 있는 세션 조건** (`activeSessionWhere`) - 네 가지를 모두 만족해야 한다.

| 조건 | 끊기는 경우 |
|---|---|
| `revokedAt IS NULL` | 로그아웃, 기기 로그아웃, 재사용 감지 |
| `tokenVersion = Users.tokenVersion` | 모든 기기 로그아웃, 비밀번호 변경·초기화, 삭제·복구 |
| `expiresAt > now` | 로그인 후 7일 |
| `lastUsedAt > now - 1일` | 1일 동안 재발급 없음 |

- **`tokenVersion` 컬럼을 둔 이유**: 전체 로그아웃 때 다른 세션 행을 일일이 폐기하지 않아도 목록과 재발급에서 자동으로 제외된다. `UsersModule`이 세션 테이블을 몰라도 된다(비밀번호 초기화, 삭제는 users 쪽 코드).
- **정리**: 스케줄러 없이 **로그인할 때 그 사용자의 끝난 세션만** 지운다(`deleteDeadSessions`). 로그인하지 않는 사용자의 행은 남지만 수가 적어 문제없다.
- **IP는 저장하지 않는다**: Next.js rewrite·Nginx 뒤에서는 `req.ip`가 프록시 주소가 된다. `trust proxy` 설정 없이 저장하면 잘못된 값이 쌓이므로 뺐다. (필요하면 배포 단계에서 프록시 설정과 함께 추가)

---

## 7. 무효화 수단 비교

| 수단 | 범위 | access 즉시 무효? | refresh 즉시 무효? | 쓰는 곳 |
|---|---|---|---|---|
| 세션 폐기 (`revokedAt`) | 기기 1개 | ❌ (최대 10분) | ✅ | 로그아웃, 기기 로그아웃, 재사용 감지 |
| `tokenVersion` +1 | 사용자 전체 | ❌ (최대 10분) | ✅ | 전체 로그아웃, 비밀번호 변경·초기화, 삭제·복구 |
| `status` 변경 | 사용자 전체 | ❌ (최대 10분) | ✅ (403) | 퇴사, 비활성 |
| `role` 변경 | 사용자 전체 | ❌ (최대 10분, 옛 권한 유지) | 재발급 시 새 권한 | 가입 승인, 권한 변경 |

> 모든 수단에서 access는 즉시 끊기지 않는다. access 검증에서 DB 조회를 뺀 대가이며(4.0), 최악의 경우 10분이다.
| 쿠키 삭제만 | 이 브라우저 | ❌ | ❌ (복사본 생존) | 예전 구조 (지금은 세션 폐기와 함께) |

---

## 8. 알려진 한계와 트레이드오프

| 한계 | 이유 / 대응 |
|---|---|
| 어떤 방법으로 끊어도 access는 최대 10분 유효 (세션 폐기·`tokenVersion`·퇴사·권한 변경) | access를 완전히 stateless로 둔 대가(4.0). 즉시 끊으려면 요청마다 회원·세션을 조회해야 해서 JWT 이점이 사라짐. 10분은 허용 범위로 판단 |
| 퇴사 처리 후 최대 10분간 API 사용 가능 | 재발급에서 403으로 막힘. 더 짧게 하려면 access 만료를 줄임 |
| 유예 1분 안에는 직전 토큰도 통과 | 여러 탭 사용성과 교환. 이후 옛 토큰 사용 시 감지됨 |
| 재사용 감지 시 정상 사용자도 로그아웃 | 서버가 공격자를 구분할 수 없음. 재로그인으로 복구 |
| 전체 로그아웃의 ①(ver+1)과 ②(세션 갱신)가 한 트랜잭션이 아님 | ② 실패 시 지금 기기도 로그아웃될 뿐 보안 문제는 없음. 서로 다른 서비스(Users/Auth)라 트랜잭션 전달을 하지 않음 |
| 세션 도입 전 발급된 토큰 | `sid`·`jti`가 없어 재발급 401 → 한 번 재로그인 |
| access·refresh가 같은 `JWT_SECRET` | `type` 클레임으로 구분. 분리하면 검사 누락에 대한 안전장치가 되지만, 같은 `.env`라 키 유출 대비 효과는 제한적 |
| 단일 서버 기준 | 세션이 DB에 있으므로 서버를 늘려도 동작. 성능이 문제되면 Redis로 옮길 수 있음 |
| 로그인 유지를 선택하지 않아도 브라우저를 닫은 뒤 로그인이 남을 수 있음 | 브라우저의 이전 세션 복원·백그라운드 실행이 세션 쿠키를 보존하는 경우. 서버에서 막을 수 없음 |

---

## 9. 동작 확인 (2026-11-07, 테스트 계정 2611001, curl)

| 시나리오 | 기대 | 결과 |
|---|---|---|
| 재발급 시 refresh jti가 바뀜 | 새 jti | ✅ |
| 교체 직후 직전 토큰 재사용 (유예) | 201, 현재 jti로 발급 | ✅ |
| 두 세대 전 토큰 재사용 | 401 + 세션 폐기 | ✅ |
| 감지 후 최신 토큰도 | 401 | ✅ |
| 감지돼도 다른 기기 | 영향 없음 | ✅ |
| 같은 토큰으로 동시 재발급 2건 | 둘 다 201 | ✅ |
| (유예 5분 설정 당시) 60초 후 직전 토큰 재사용 | 201 | ✅ |
| (유예 5분 설정 당시) 305초 후 직전 토큰 재사용 | 401 + 세션 폐기 | ✅ |
| 유예 1분 변경 후 경계 확인 | 59초 허용 · 61초 폐기 | 미검증 (값만 변경, 판단 로직은 위와 같음) |
| `alg: none` 위조 토큰 | 401 | ✅ |
| 로그아웃 후 그 기기 refresh | 401 | ✅ |
| 기기 목록 | 기기별 표시, current 표시 | ✅ |
| 다른 기기 지정 로그아웃 / 없는 id | 그 기기 refresh 401 / 404 | ✅ |
| 모든 기기 로그아웃 | 다른 기기 access·refresh 401, 지금 기기 새 토큰 200 | ✅ (회원 조회를 빼기 전 결과. 지금은 다른 기기 access가 만료까지 유효) |
| 비밀번호 변경 | 다른 기기 401, 지금 기기 유지 | ✅ (위와 같음, 현재는 refresh만 즉시 401) |
| **access에서 회원 조회 제거 후** (같은 날) | | |
| access payload에 `role` 포함 | `"role":"USER"` | ✅ |
| `GET /users/me` (서비스에서 조회) | 이름·권한·상태 응답 | ✅ |
| USER 토큰으로 관리자 API | 403 (payload role로 판단) | ✅ |
| 퇴사(RESIGNED) 처리 후 기존 access | 200 (만료까지 유효) | ✅ |
| 퇴사 처리 후 재발급 | 403 | ✅ |
| 상태 복구 후 재발급 | 201 | ✅ |
| **로그인 유지** (2026-11-18, `test/auth-remember-me.e2e-spec.ts`) | | |
| 미체크 로그인 / 재발급 / 비밀번호 변경 / 모든 기기 로그아웃 | `Max-Age` 없는 쿠키 | ✅ |
| 체크 로그인 / `rememberMe` 없는 로그인 / 회원가입 | `Max-Age` 있는 쿠키 | ✅ |
| `rememberMe`가 boolean이 아님 | 400, 세션 생성 없음 | ✅ |
| 실제 브라우저를 닫았다 열기 | 다시 로그인 | 미검증 |

> curl로 테스트할 때 주의: 쿠키가 `Path=/api/auth`라서 백엔드 직접 주소(`localhost:3100/auth/...`)로 보내면 쿠키 저장소가 쿠키를 싣지 않는다. `-H "Cookie: refreshToken=..."`로 직접 넣어야 한다.

---

## 10. 스스로 설명해 보기 (체크리스트)

1. JWT의 세 부분은 각각 무엇이고, payload에 비밀번호를 넣으면 안 되는 이유는?
2. `alg: none` 공격은 무엇이고, 이 프로젝트는 어떻게 막는가?
3. access와 refresh를 같은 키로 서명하는데 어떻게 구분하나? 구분하지 않으면 생기는 공격은?
4. access token을 메모리에, refresh token을 HttpOnly 쿠키에 두는 이유는?
5. JWT는 stateless인데 왜 세션 테이블을 만들었나? 왜 access는 그대로 stateless인가?
6. refresh token rotation과 재사용 감지는 어떻게 동작하나? 왜 "옛 토큰이 다시 온다"가 탈취 신호인가?
7. 여러 탭에서 동시에 재발급하면 어떤 문제가 생기고, 어떻게 해결했나? 그 해결의 대가는?
8. 동시에 두 재발급 요청이 같은 jti로 들어오면? (`updateMany` WHERE + count)
9. 로그아웃하면 토큰은 어떻게 되나? access와 refresh 각각.
10. "이 기기만 로그아웃"과 "모든 기기 로그아웃"을 다른 수단으로 구현한 이유는?
11. 비밀번호를 바꾸면 다른 기기는 어떻게 끊기나? 바꾼 본인은 왜 로그인이 유지되나? 다른 기기의 access는 언제까지 쓸 수 있나?
12. 퇴사 처리된 사용자의 토큰은? (access는 최대 10분, 재발급에서 403)
16. 토큰에 `role`을 넣고 access 검증에서 DB 조회를 뺀 이유와 대가는? (4.0)
13. `JWT_SECRET`이 짧으면 무슨 일이 생기나?
14. 세션 테이블이 계속 쌓이지 않게 어떻게 정리하나?
15. 서버를 여러 대로 늘리면 이 구조는 그대로 동작하나?
17. 로그인 유지를 체크하지 않으면 브라우저를 닫을 때 왜 로그아웃되나? 선택값을 세션 행에 저장한 이유는? (5.9)
