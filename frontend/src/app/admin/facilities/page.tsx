import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { FacilityAdminView } from "@/features/admin/components/facilities/facility-admin-view";

export const metadata: Metadata = { title: "시설 관리" };

export default function AdminFacilitiesPage() {
  return (
    <>
      <PageHeader title="시설 관리" description="시설 분류(예약 규칙)와 시설, 사용 불가 기간을 관리합니다." />
      <FacilityAdminView />
    </>
  );
}
