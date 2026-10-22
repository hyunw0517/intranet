// 공통 API 클라이언트 (브라우저 → /api/* → NestJS)
// - 상대 경로 /api 를 사용하므로 Client Component(TanStack Query)에서 호출한다.
// - Server Component·Route Handler에서 NestJS를 직접 호출할 때는 API_SERVER_URL을 사용한다.
// - Authorization 헤더 주입과 401 → 토큰 재발급 → 재시도는 FE-01(인증)에서 추가한다.

const API_BASE_PATH = "/api";

type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, QueryValue>;
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

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, query, headers, ...init } = options;
  const isFormData = body instanceof FormData;

  const res = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      ...(body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  const data = await parseBody(res);

  if (!res.ok) {
    const err = (typeof data === "object" && data !== null ? data : {}) as NestErrorBody;
    const messages = Array.isArray(err.message) ? err.message : err.message ? [err.message] : [];
    throw new ApiError(res.status, messages, data);
  }

  return data as T;
}
