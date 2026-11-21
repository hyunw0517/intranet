# 00. 프론트엔드 초기 설정 — 구조와 역할

> 작업일: 2026-10-23 · 결정 이유와 시행착오는 [devlog](../devlog/2026-10-19.md)의 2026-10-23 항목 참고
> 이 문서는 "지금 코드가 어떻게 생겼고 각 부분이 무슨 일을 하는가"를 설명한다.

## 1. 기술 스택 한눈에 보기

| 구분 | 사용 | 역할 |
|---|---|---|
| 프레임워크 | Next.js 16 (App Router) | 라우팅, 서버 렌더링, `/api` 프록시 |
| UI | React 19 + TypeScript | 화면 컴포넌트 |
| 스타일 | Tailwind CSS v4 | 유틸리티 클래스로 스타일 작성 |
| 컴포넌트 | shadcn/ui (Radix 기반) | Button, Dialog, Sidebar 등 기본 부품. **라이브러리가 아니라 소스가 `components/ui`에 복사됨** → 직접 수정 가능 |
| 아이콘 | lucide-react | 아이콘 컴포넌트 |
| 테마 | next-themes | Light / Dark / System 전환 |
| 서버 상태 | TanStack Query | API 응답 캐시, 로딩·에러 상태, 재요청 |
| 토스트 | sonner | 성공·실패 알림 |
| 폰트 | Pretendard Variable | `next/font/local`로 로드 |

> shadcn/ui가 일반 라이브러리와 다른 점: `npx shadcn add button`을 하면 node_modules가 아니라 **내 프로젝트에 코드가 생성**된다. 그래서 `use-mobile.ts`처럼 생성된 코드에 문제가 있으면 직접 고칠 수 있고, 고쳐야 한다.

## 2. 폴더 구조와 역할

```text
frontend/
├── next.config.ts            # /api/* → NestJS 프록시(rewrites)
├── components.json           # shadcn CLI 설정 (컴포넌트 생성 위치 등)
├── .env / .env.example       # API_SERVER_URL (서버 전용)
└── src/
    ├── app/                  # 라우팅 (폴더 = URL)
    │   ├── layout.tsx        # 루트 레이아웃: <html>, 폰트, Provider
    │   ├── globals.css       # Tailwind + 디자인 토큰(CSS 변수)
    │   ├── (main)/           # 직원용 화면 (URL에 (main) 안 붙음)
    │   │   ├── layout.tsx    #   → AppShell variant="main"
    │   │   └── page.tsx      #   → "/" 대시보드
    │   ├── admin/            # 관리자 화면 (URL: /admin)
    │   │   ├── layout.tsx    #   → AppShell variant="admin"
    │   │   └── page.tsx
    │   └── (auth)/           # 로그인·회원가입 (사이드바 없는 레이아웃만 있음)
    │       └── layout.tsx
    ├── components/
    │   ├── ui/               # shadcn이 생성한 기본 부품 (가급적 수정 최소화)
    │   └── layout/           # 앱 공통 껍데기 (사이드바, 헤더, 페이지 제목)
    ├── providers/            # 앱 전체를 감싸는 Context Provider
    ├── services/             # api-client.ts(공통 통신) + api/(엔드포인트 함수, 백엔드 컨트롤러와 1:1)
    ├── hooks/                # 공통 훅 (use-mobile.ts)
    ├── lib/                  # 유틸 (cn: 클래스 병합)
    ├── features/             # 기능별 components/hooks (API 함수는 services/api/)
    └── types/                # (비어 있음) 공통 타입
```

### Route Group `( )`
- `(main)`, `(auth)`처럼 괄호로 감싼 폴더는 **URL에 포함되지 않고 레이아웃만 나누는 용도**다.
- `app/(main)/page.tsx`의 URL은 `/`이다. 그래서 기본 템플릿의 `app/page.tsx`는 지웠다. 둘 다 있으면 같은 URL이 겹친다.
- `admin`은 괄호가 없으므로 URL에 `/admin`이 붙는다.

### `features/`와 `components/`의 구분
- `components/`: 기능과 무관하게 어디서나 쓰는 것 (버튼, 레이아웃).
- `features/<기능>/`: 특정 기능 전용 화면·훅 (예: `features/board/components/PostList.tsx`, `features/board/hooks/use-posts.ts`).
- API 함수는 기능 폴더가 아니라 `services/api/<도메인>.ts`에 둔다(2026-10-26 변경, AGENTS.md 12장). 여러 화면이 같이 쓰고 백엔드 컨트롤러와 1:1로 맞추기 위해서다.
- `app/` 페이지 파일은 얇게 유지하고, 실제 로직은 `features/`에서 가져다 쓴다. (AGENTS.md 12장)

## 3. 렌더링 트리 — 무엇이 무엇을 감싸는가

```text
app/layout.tsx (Server)
└── <html class="폰트변수 [dark]">
    └── AppProviders (Client)
        ├── ThemeProvider        ← <html>에 dark 클래스 부여/제거
        ├── QueryProvider        ← QueryClient 1개 생성, 하위에서 useQuery 사용 가능
        ├── TooltipProvider
        ├── Toaster              ← toast() 호출 시 표시
        └── children
            └── (main)/layout.tsx (Server)
                └── AppShell (Server)       ← 쿠키에서 사이드바 접힘 상태 읽기
                    └── SidebarProvider (Client)
                        ├── AppSidebar (Client)   ← usePathname으로 활성 메뉴 표시
                        └── SidebarInset
                            ├── AppHeader (Client) ← 현재 메뉴 제목, 테마 토글
                            └── page.tsx (Server)
```

## 4. Server Component vs Client Component

App Router의 컴포넌트는 **기본이 Server Component**다. 파일 맨 위에 `"use client"`가 있어야 Client Component가 된다.

| 구분 | 실행 위치 | 할 수 있는 것 | 이 프로젝트 예시 |
|---|---|---|---|
| Server | 서버(Node) | `cookies()`·DB·비밀 env 접근, JS 번들에 포함 안 됨 | `layout.tsx`, `AppShell`, `page.tsx`, `PageHeader` |
| Client | 브라우저(+ 첫 HTML은 서버에서도 렌더) | `useState`, `onClick`, `usePathname`, localStorage | `AppSidebar`, `AppHeader`, `ThemeToggle`, Provider들 |

### 판단 기준
- 클릭, 상태, 브라우저 API가 필요하면 Client, 아니면 Server로 둔다.
- Server Component가 Client Component를 **import해서 렌더링하는 것은 가능**하다.
- 반대로 **Client가 Server를 import할 수는 없다.** `children`으로 받는 것은 가능하다.
  - 예: `AppProviders`(Client)가 `children`으로 페이지(Server)를 감싼다.

### 경계에서 넘길 수 있는 props
- Server → Client로 넘기는 props는 **직렬화 가능한 값**(문자열, 숫자, 객체, 배열)만 가능하다.
- 함수나 컴포넌트는 넘길 수 없다.
- 그래서 `AppShell`(Server)은 아이콘이 든 메뉴 배열 대신 `variant="main"` 문자열만 넘긴다. 메뉴 배열(`nav-items.ts`)은 Client 쪽에서 import한다.

## 5. 요청 흐름 — 브라우저에서 NestJS까지

```text
[개발]
브라우저 ──fetch("/api/users")──▶ Next.js(3000) ──rewrite──▶ NestJS(3100) /users
                                   └ next.config.ts: /api/:path* → ${API_SERVER_URL}/:path*

[운영 (예정)]
브라우저 ──"/api/users"──▶ Nginx(443) ──/api 제거──▶ NestJS /users
                           └ 그 외 경로 ─────────▶ Next.js
```

- 브라우저 입장에서는 항상 **같은 출처(origin)의 `/api`**이므로 CORS 문제가 없다.
- 프론트 코드는 개발과 운영에서 똑같다(`/api/...` 상대 경로).
- `API_SERVER_URL`은 서버(Next.js)만 사용하므로 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
  - `NEXT_PUBLIC_*`은 빌드할 때 JS 번들에 그대로 박혀 브라우저에 노출된다.

### 인증 쿠키 (FE-01에서 구현 예정)

```text
브라우저 ──POST /api/auth/login/emp──▶ (rewrite) ──▶ NestJS /auth/login/emp
                                                     ├ Set-Cookie: refreshToken (HttpOnly)
                                                     └ 본문: accessToken → React 메모리에 보관
브라우저 ──POST /api/auth/token/access──▶ NestJS   ← 쿠키가 자동으로 붙어 감
```
- **NestJS가 직접 `Set-Cookie`** 한다. Next.js는 `/api` rewrite로 그대로 전달만 한다.
- 브라우저 입장에서 프론트와 API가 **같은 출처**(`/api`)라서 CORS 설정 없이 쿠키가 저장되고 전송된다.
- HttpOnly 쿠키는 JS로 읽을 수 없어서 XSS로 탈취되지 않는다. access token은 메모리에만 두고, 새로고침하면 재발급 API로 다시 받는다.
- **쿠키 `Path` 주의**: NestJS는 `/api`가 떨어진 `/auth/...`를 받지만, 쿠키 Path는 **브라우저가 보는 경로** 기준이다. 그래서 `Path=/api/auth`로 지정해야 한다.
- PHP의 `PHPSESSID` 세션 쿠키와 같은 원리다. 서버가 `Set-Cookie`로 내려주면 브라우저가 요청마다 자동으로 붙인다.
- 처음에는 Next.js Route Handler(BFF)가 쿠키를 처리하도록 설계했다가 바꿨다. 경위는 devlog 2026-10-23 항목 참고.

## 6. API 클라이언트와 TanStack Query

### `services/api-client.ts`
```ts
const users = await apiFetch<User[]>("/users", { query: { page: 1 } });
// → GET /api/users?page=1
```
- `body`를 넘기면 JSON으로 변환하고 `Content-Type`을 붙인다(FormData는 그대로 보냄).
- 실패하면 `ApiError`를 던진다.
  - `status`: HTTP 상태 코드
  - `messages`: NestJS의 `message`를 항상 배열로 맞춘 값 (ValidationPipe 오류는 원래 배열)
- 아직 없는 것: Authorization 헤더, 401 처리 (FE-01에서 추가).

### TanStack Query를 쓰는 이유
`useEffect + fetch + useState`로 직접 하면 로딩·에러·캐시·중복 요청 처리를 매번 짜야 한다. TanStack Query는 이것을 **queryKey 단위 캐시**로 관리한다.

```ts
// 사용 예 (기능 개발 시)
const { data, isPending, error } = useQuery({
  queryKey: ["users", { page }],            // 키가 같으면 캐시 공유, 바뀌면 새로 요청
  queryFn: () => apiFetch<UserPage>("/users", { query: { page } }),
});

// 수정 후 목록 갱신
const qc = useQueryClient();
useMutation({ mutationFn: updateUser, onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) });
```

### 기본 설정 (`providers/query-provider.tsx`)
| 설정 | 값 | 이유 |
|---|---|---|
| `staleTime` | 30초 | 30초 안에 같은 화면을 다시 열면 재요청하지 않음 |
| `refetchOnWindowFocus` | false | 탭 전환마다 재요청하지 않음 (업무 화면에서 과한 요청 방지) |
| `retry` | 4xx는 0회, 그 외 1회 | 권한·검증 오류는 다시 보내도 결과가 같다 |

## 7. 디자인 토큰과 테마

### 토큰 → 클래스 연결 (`globals.css`)
```text
:root { --primary: #5268a8; }            ← Light 값
.dark { --primary: #91a7eb; }            ← Dark 값
@theme inline { --color-primary: var(--primary); }  ← Tailwind에 등록
          ↓
<button className="bg-primary text-primary-foreground">
```
- 컴포넌트에는 `#5268a8` 같은 색상 값을 직접 쓰지 않고 `bg-primary`, `text-muted-foreground`처럼 **의미 이름**으로 쓴다.
- 그러면 `.dark` 클래스 하나로 모든 색이 바뀐다.

### 테마 전환 흐름
1. `ThemeToggle`에서 "다크"를 선택하면 next-themes가 `localStorage.theme = "dark"`로 저장하고 `<html class="dark">`를 붙인다.
2. 새로고침하면 next-themes가 React보다 먼저 실행되는 작은 스크립트로 class를 붙인다. 그래서 화면이 깜빡이지 않는다.
3. 이 스크립트 때문에 서버 HTML과 브라우저 HTML의 `<html>` class가 달라진다. 그래서 `<html>`에 `suppressHydrationWarning`을 붙였다.

> **Hydration**: 서버가 만든 HTML에 React가 이벤트를 연결하는 과정. 서버 결과와 브라우저 첫 렌더 결과가 다르면 경고나 오류가 난다. 테마 아이콘을 `useTheme()` 값이 아니라 `dark:hidden` CSS로 바꾸는 이유도 이것이다. 서버는 사용자의 테마를 모르기 때문이다.

## 8. 공통 레이아웃 (`components/layout/`)

| 파일 | 종류 | 역할 |
|---|---|---|
| `app-shell.tsx` | Server | 사이드바 + 헤더 + 본문 틀. 쿠키 `sidebar_state`로 첫 렌더부터 접힘 상태 반영 |
| `app-sidebar.tsx` | Client | 메뉴 렌더링, 활성 표시, 모바일에서 메뉴 클릭 시 Sheet 닫기, 직원 ↔ 관리자 이동 |
| `app-header.tsx` | Client | 사이드바 토글 버튼, 현재 메뉴 제목, 테마 토글 |
| `nav-items.ts` | - | 메뉴 정의 (`mainNav`, `adminNav`). **실제로 구현된 페이지만 등록** |
| `is-active-path.ts` | - | 활성 메뉴 판단 (`/`·`/admin`은 정확히 일치, 나머지는 하위 경로 포함) |
| `theme-toggle.tsx` | Client | Light / Dark / System 선택 |
| `page-header.tsx` | Server | 페이지 제목·설명·액션 버튼 영역 |

- **반응형**: shadcn `Sidebar`가 `useIsMobile()`(768px 미만)로 판단해, PC에서는 고정 사이드바(아이콘으로 접힘)를, 모바일에서는 Sheet(서랍)를 보여준다.
- **메뉴 추가 방법**: 페이지를 만든 뒤 `nav-items.ts`에 `{ title, href, icon }`을 추가한다.

## 9. 설계 포인트
1. **왜 NestJS를 직접 호출하지 않고 `/api` 프록시를 거치나?**
   → CORS 회피, 운영 Nginx와 같은 경로 정책, 프론트 코드에서 백엔드 주소 제거.
2. **refresh token을 어디에 저장했나? 프론트와 백엔드 도메인이 다르면?**
   → NestJS가 HttpOnly 쿠키로 내려준다. 같은 도메인의 `/api`로 묶어서 CORS 없이 쿠키가 전달된다. (PHP 세션 쿠키와 같은 원리)
   → 도메인이 나뉘면 CORS credentials 허용과 프론트의 `credentials: 'include'`가 필요하고, 아예 다른 도메인이면 브라우저가 쿠키를 막을 수 있어 보통 같은 도메인 아래에 둔다고 알고 있다.
3. **Server Component와 Client Component를 어떻게 나눴나?**
   → 상호작용·브라우저 API가 필요한 곳만 Client. 경계에서는 직렬화 가능한 값만 전달(아이콘 문제 사례).
4. **TanStack Query를 쓰는 이유는? 수정 후 목록은 어떻게 갱신하나?**
   → queryKey 단위 캐시, `invalidateQueries`.
5. **다크 모드에서 깜빡임이나 hydration 오류를 어떻게 막았나?**
6. **`NEXT_PUBLIC_` 환경변수의 위험은?**
   → 빌드할 때 번들에 포함되어 브라우저에 노출된다.
