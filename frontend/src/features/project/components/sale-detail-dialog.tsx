"use client";

import { useState } from "react";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FileDownloadConfirmDialog } from "@/components/common/file-download-confirm-dialog";
import { FormError } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-message";
import { formatFileSize } from "@/lib/format";
import { addSalePayment, billSale, deleteSalePayment, downloadSaleFile } from "@/services/api/project-sales";
import type { FileInfo } from "@/types/file";
import { formatAmount, formatTax, PAYMENT_STATUS_LABEL, SALE_STATUS_LABEL, type ProjectSale, type SalePayment } from "@/types/project";
import { useProjectMutation } from "../hooks/use-projects";

const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const digits = (value: string) => value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "").slice(0, 15);

// 매출 상세 - 금액·세금계산서(파일 다운로드), 청구 처리, 수금 기록(부분 수금) (docs/design/projects.md 5-2장)
export function SaleDetailDialog({ projectId, sale, onClose }: { projectId: number; sale: ProjectSale | null; onClose: () => void }) {
  return (
    <Dialog open={sale !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">{sale && <SaleDetail projectId={projectId} sale={sale} />}</DialogContent>
    </Dialog>
  );
}

function SaleDetail({ projectId, sale }: { projectId: number; sale: ProjectSale }) {
  const rows: [string, string][] = [
    ["상태", `${SALE_STATUS_LABEL[sale.status]}${sale.status === "BILLED" ? ` · ${PAYMENT_STATUS_LABEL[sale.paymentStatus]}` : ""}`],
    ["견적", sale.quoteVersion ? `${sale.quoteVersion.quote.quoteNo} v${sale.quoteVersion.version} · ${sale.quoteVersion.quote.title}` : "견적 없음"],
    ["과세", formatTax(sale.taxType, sale.vatRate)],
    ["공급가액", formatAmount(sale.supplyAmount)],
    ["부가세", formatAmount(sale.vatAmount)],
    ["합계", formatAmount(sale.totalAmount)],
    ["청구 예정일", sale.plannedDate?.slice(0, 10) ?? "-"],
    ["청구일", sale.billedDate?.slice(0, 10) ?? "-"],
    ["승인번호", sale.taxInvoiceNo ?? "-"],
  ];

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{sale.title}</DialogTitle>
        <DialogDescription>{sale.memo ?? "매출 청구 건"}</DialogDescription>
      </DialogHeader>

      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[88px_1fr] gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <InvoiceFiles projectId={projectId} saleId={sale.id} files={sale.files} />
      {sale.status === "PLANNED" && <BillForm projectId={projectId} saleId={sale.id} />}
      {sale.status === "BILLED" && <Payments projectId={projectId} sale={sale} />}
    </div>
  );
}

// 세금계산서 파일 - Bearer 헤더가 필요해 fetch로 받아 저장, 받기 전 보안 확인 창(게시글·결재 첨부와 같은 방식)
function InvoiceFiles({ projectId, saleId, files }: { projectId: number; saleId: number; files: FileInfo[] }) {
  const [target, setTarget] = useState<FileInfo | null>(null);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!target) return;
    setDownloading(true);
    try {
      const blob = await downloadSaleFile(projectId, saleId, target.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = target.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTarget(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium">세금계산서 파일</h3>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">첨부한 파일이 없습니다. [수정]에서 첨부할 수 있습니다.</p>
      ) : (
        <ul className="grid gap-1">
          {files.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setTarget(f)} className="inline-flex items-center gap-1.5 text-sm hover:underline">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
                {f.originalName}
                <span className="text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <FileDownloadConfirmDialog fileName={target?.originalName ?? ""} open={target !== null} onOpenChange={(open) => !open && setTarget(null)} pending={downloading} onConfirm={download} />
    </section>
  );
}

// 청구 처리 (청구 예정 → 청구) - 승인번호·파일은 청구 뒤 [수정]에서도 넣을 수 있다
function BillForm({ projectId, saleId }: { projectId: number; saleId: number }) {
  const [billedDate, setBilledDate] = useState(kstToday());
  const [error, setError] = useState<string | null>(null);
  const bill = useProjectMutation(() => billSale(projectId, saleId, { billedDate }));

  const run = async () => {
    setError(null);
    try {
      await bill.mutateAsync(undefined);
      toast.success("청구로 바꿨습니다. 청구일이 매출 기준일이 됩니다.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <section className="grid gap-2 rounded-md border p-3">
      <h3 className="text-sm font-medium">청구하기</h3>
      <FormError message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={billedDate} onChange={(e) => setBilledDate(e.target.value || kstToday())} className="w-44" aria-label="청구일" />
        <Button type="button" onClick={run} disabled={bill.isPending}>
          {bill.isPending && <Loader2 className="animate-spin" aria-hidden />}
          청구
        </Button>
      </div>
    </section>
  );
}

// 수금 기록 (부분 수금) - 합계는 청구 금액까지 (서버도 400)
function Payments({ projectId, sale }: { projectId: number; sale: ProjectSale }) {
  const [paidDate, setPaidDate] = useState(kstToday());
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SalePayment | null>(null);

  const remaining = BigInt(sale.totalAmount) - BigInt(sale.paidAmount);
  const add = useProjectMutation(() => addSalePayment(projectId, sale.id, { paidDate, amount: Number(amount), memo: memo.trim() || null }));
  const remove = useProjectMutation((paymentId: number) => deleteSalePayment(projectId, sale.id, paymentId));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return setError("수금액을 입력해 주세요.");
    if (BigInt(amount) > remaining) return setError(`남은 금액(${formatAmount(remaining.toString())})을 넘습니다.`);
    setError(null);
    try {
      await add.mutateAsync(undefined);
      toast.success("수금을 기록했습니다.");
      setAmount("");
      setMemo("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const runRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast.success("수금 기록을 삭제했습니다.");
      setRemoving(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">수금 ({PAYMENT_STATUS_LABEL[sale.paymentStatus]})</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatAmount(sale.paidAmount)} / {formatAmount(sale.totalAmount)}
        </span>
      </div>

      {sale.payments.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {sale.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="tabular-nums">
                {p.paidDate.slice(0, 10)} · {formatAmount(p.amount)}
                {p.memo && <span className="text-muted-foreground"> · {p.memo}</span>}
              </span>
              <Button variant="ghost" size="icon-sm" onClick={() => setRemoving(p)} aria-label={`${p.paidDate.slice(0, 10)} 수금 삭제`}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {remaining > BigInt(0) && (
        <form onSubmit={submit} className="grid gap-2 rounded-md border p-3">
          <FormError message={error} />
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value || kstToday())} className="w-40" aria-label="수금일" />
            <Input
              inputMode="numeric"
              value={amount ? Number(amount).toLocaleString("ko-KR") : ""}
              onChange={(e) => setAmount(digits(e.target.value))}
              placeholder={`최대 ${remaining.toLocaleString("ko-KR")}`}
              className="w-44"
              aria-label="수금액"
            />
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} placeholder="메모" className="min-w-32 flex-1" aria-label="수금 메모" />
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Loader2 className="animate-spin" aria-hidden />}
              수금 기록
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="수금 기록을 삭제할까요?"
        description="잘못 기록한 수금을 지웁니다. 기록은 감사 로그에 남습니다."
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={runRemove}
      />
    </section>
  );
}
