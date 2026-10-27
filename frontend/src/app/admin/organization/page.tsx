import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { OrganizationView } from "@/features/admin/components/organization/organization-view";

export const metadata: Metadata = { title: "조직 관리" };

export default function AdminOrganizationPage() {
  return (
    <>
      <PageHeader title="조직 관리" description="부서, 직급, 직책을 관리합니다." />
      <OrganizationView />
    </>
  );
}
