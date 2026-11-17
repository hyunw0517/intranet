import { cn } from "@/lib/utils";
import { formatAmount, formatBusinessNo, QUOTE_TAX_LABEL, type QuoteVersion } from "@/types/project";

// 견적서 양식 (읽기 전용) - 상세 화면에 보이고, [인쇄]하면 이 영역만 종이에 나온다(globals.css의 .print-area)
// 발주처·담당자는 버전에 저장된 스냅샷을 그대로 보여 준다(거래처가 바뀌어도 낸 견적서는 그대로).
export function QuoteDocument({ quoteNo, title, version, className }: { quoteNo: string; title: string; version: QuoteVersion; className?: string }) {
  const rows: [string, string][] = [
    ["견적번호", `${quoteNo} v${version.version}`],
    ["견적일", version.quoteDate.slice(0, 10)],
    ["유효기간", version.validUntil ? `${version.validUntil.slice(0, 10)}까지` : "-"],
    ["과세", QUOTE_TAX_LABEL[version.taxType]],
  ];
  const client: [string, string][] = [
    ["회사명", version.clientName],
    ["사업자등록번호", formatBusinessNo(version.clientBusinessNo)],
    ["대표자", version.clientCeoName ?? "-"],
    ["주소", version.clientAddress ?? "-"],
    ["담당자", version.contactName ? [version.contactName, version.contactDepartment, version.contactJobTitle].filter(Boolean).join(" · ") : "-"],
  ];

  return (
    <article className={cn("print-area grid gap-6 rounded-lg border bg-card p-6 text-sm sm:p-8", className)}>
      <header className="grid gap-1 text-center">
        <h2 className="text-2xl font-semibold tracking-[0.5em]">견 적 서</h2>
        <p className="text-muted-foreground">{title}</p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 font-medium">수신 (발주처)</h3>
          <dl className="grid gap-1">
            {client.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[96px_1fr] gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3 className="mb-2 font-medium">견적 정보</h3>
          <dl className="grid gap-1">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[96px_1fr] gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div className="rounded-md bg-muted/50 px-4 py-3 text-center">
        <span className="text-muted-foreground">합계 금액 (부가세 {version.taxType === "TAXABLE" ? "포함" : "없음"})</span>
        <p className="text-xl font-semibold tabular-nums">{formatAmount(version.totalAmount)}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-y bg-muted/40 text-left">
              <th className="w-10 px-2 py-2 text-center font-medium">No</th>
              <th className="px-2 py-2 font-medium">품목</th>
              <th className="px-2 py-2 font-medium">규격</th>
              <th className="w-16 px-2 py-2 text-right font-medium">수량</th>
              <th className="w-32 px-2 py-2 text-right font-medium">단가</th>
              <th className="w-36 px-2 py-2 text-right font-medium">금액</th>
              <th className="px-2 py-2 font-medium">비고</th>
            </tr>
          </thead>
          <tbody>
            {version.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                  품목이 없습니다.
                </td>
              </tr>
            ) : (
              version.items.map((item, i) => (
                <tr key={item.id} className="border-b">
                  <td className="px-2 py-2 text-center tabular-nums">{i + 1}</td>
                  <td className="px-2 py-2">{item.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{item.spec ?? ""}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{item.quantity.toLocaleString("ko-KR")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatAmount(item.unitPrice)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatAmount(item.amount)}</td>
                  <td className="px-2 py-2 text-muted-foreground">{item.note ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="tabular-nums">
            <tr>
              <td colSpan={5} className="px-2 pt-3 text-right text-muted-foreground">공급가액</td>
              <td className="px-2 pt-3 text-right">{formatAmount(version.supplyAmount)}</td>
              <td />
            </tr>
            <tr>
              <td colSpan={5} className="px-2 text-right text-muted-foreground">부가세</td>
              <td className="px-2 text-right">{formatAmount(version.vatAmount)}</td>
              <td />
            </tr>
            <tr className="font-semibold">
              <td colSpan={5} className="px-2 pb-1 text-right">합계</td>
              <td className="px-2 pb-1 text-right">{formatAmount(version.totalAmount)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {version.note && (
        <section>
          <h3 className="mb-1 font-medium">비고</h3>
          <p className="whitespace-pre-wrap text-muted-foreground">{version.note}</p>
        </section>
      )}
    </article>
  );
}
