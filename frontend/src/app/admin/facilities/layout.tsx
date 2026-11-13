import { AddonGate } from "@/features/addon/guards/addon-gate";

// 시설 관리 (애드온 reservations) - 꺼져 있으면 일반 404
export default function AdminFacilitiesLayout({ children }: LayoutProps<"/admin/facilities">) {
  return <AddonGate name="reservations">{children}</AddonGate>;
}
