import { ApiError } from "@/services/api-client";

// API 오류를 화면에 보여 줄 문장으로 바꾼다.
export function getErrorMessage(error: unknown, fallback = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.") {
  if (error instanceof ApiError) {
    if (error.status >= 500) return "서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    return error.messages[0] ?? fallback;
  }
  if (error instanceof TypeError) return "서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.";
  return fallback;
}
