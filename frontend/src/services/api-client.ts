// 공통 API 클라이언트 (브라우저 → /api/* → NestJS)
// - 상대 경로 /api 를 사용하므로 Client Component(TanStack Query)에서 호출한다.
// - access token은 이 모듈의 메모리 변수에만 둔다. (localStorage에 JWT를 저장하지 않음)
// - refresh token은 NestJS가 HttpOnly 쿠키로 관리하므로 JS에서 다루지 않는다.
//   같은 출처 요청이라 브라우저가 /api/auth/* 요청에 쿠키를 자동으로 붙인다.

const API_BASE_PATH = "/api";

type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, QueryValue>;
  // true면 Authorization 헤더를 붙이지 않고, 401이어도 재발급을 시도하지 않는다. (로그인·가입 등)
  skipAuth?: boolean;
}

// NestJS 기본 에러 응답: { statusCode, message, error }
// ValidationPipe 오류는 message가 문자열 배열로 온다.
interface NestErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly messages: string[],
    public readonly body?: unknown,
  ) {
    super(messages[0] ?? `요청에 실패했습니다. (${status})`);
    this.name = "ApiError";
  }
}

// ── access token (메모리) ─────────────────────────────────────────

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

// 재발급까지 실패했을 때(로그인 만료) AuthProvider가 상태를 바꿀 수 있도록 등록하는 콜백
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

// 동시에 여러 요청이 401을 받아도 재발급 요청은 하나만 보내고, 나머지는 같은 결과를 기다린다.
let refreshPromise: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_PATH}/auth/token/access`, { method: "POST" });
        if (!res.ok) {
          accessToken = null;
          return null;
        }
        const data = (await res.json()) as { accessToken: string };
        accessToken = data.accessToken;
        return accessToken;
      } catch {
        accessToken = null;
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

// ── 요청 ──────────────────────────────────────────────────────────

function buildUrl(path: string, query?: ApiRequestOptions["query"]) {
  const url = `${API_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const contentType = res.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ? res.json() : res.text();
}

function send(path: string, options: ApiRequestOptions) {
  const { body, query, headers, skipAuth, ...init } = options;
  const isFormData = body instanceof FormData;

  return fetch(buildUrl(path, query), {
    ...init,
    headers: {
      ...(body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(!skipAuth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  let res = await send(path, options);

  // access token 만료 → 재발급 1회 → 원래 요청 1회 재시도
  // /auth/* 요청은 재발급 대상이 아니다. (재발급 자체가 401이면 무한 반복되므로)
  if (res.status === 401 && !options.skipAuth && !path.startsWith("/auth/")) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await send(path, options);
    } else {
      onSessionExpired?.();
    }
  }

  const data = await parseBody(res);

  if (!res.ok) {
    const err = (typeof data === "object" && data !== null ? data : {}) as NestErrorBody;
    const messages = Array.isArray(err.message) ? err.message : err.message ? [err.message] : [];
    throw new ApiError(res.status, messages, data);
  }

  return data as T;
}
