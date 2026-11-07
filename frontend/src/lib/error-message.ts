import { ApiError, NetworkError } from "@/services/api-client";

// 오류를 화면에 보여 줄 문장으로 바꾼다.
// - ApiError: 서버가 응답한 오류 (4xx는 서버 메시지, 5xx는 공통 문구)
// - NetworkError: 서버에 닿지 못함 (api-client의 fetch에서만 만든다)
// - 그 외: 화면 코드의 예상하지 못한 오류 (TypeError 등). 네트워크 문제로 보이지 않게 따로 안내하고,
//   개발 중에는 원인을 콘솔에 남긴다.
export function getErrorMessage(error: unknown, fallback = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.") {
  if (error instanceof ApiError) {
    if (error.status >= 500) return "서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    return error.messages[0] ?? fallback;
  }
  if (error instanceof NetworkError) return "서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.";

  if (process.env.NODE_ENV !== "production") console.error("[unexpected error]", error);
  return "화면을 처리하는 중 문제가 발생했습니다. 새로고침 후 다시 시도해 주세요.";
}
