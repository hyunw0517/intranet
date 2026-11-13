// 백엔드 common/addons.controller 대응 (/common/addons)
import { apiFetch } from "@/services/api-client";

// 백엔드 src/config/addons.config.ts의 ADDONS 이름과 같다.
export type AddonName = "reservations" | "approvals" | "leaves" | "chats";

// 켜진 애드온 목록 (USER 이상) - 꺼진 애드온은 목록에 없고, 그 API는 서버에 아예 없다(404).
export function fetchEnabledAddons() {
  return apiFetch<{ enabled: AddonName[] }>("/common/addons");
}
