"use client";

import Link from "next/link";
import { FormError } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CONSENT_EFFECTIVE_DATE,
  CONSENT_VERSIONS,
  getTermsArticles,
  PRIVACY_NOTICES,
  PRIVACY_ROWS,
} from "@/features/auth/consent-documents";
import { useConsentInfo } from "@/features/auth/hooks/use-consent-info";
import type { ConsentType } from "@/services/api/auth";

// 항목별 예/아니오 값 (동의 체크, 본문 열람 여부)
export type ConsentFlags = Record<ConsentType, boolean>;

export const INITIAL_CONSENT_FLAGS: ConsentFlags = {
  TERMS_OF_SERVICE: false,
  PRIVACY_COLLECTION: false,
};

interface RegisterConsentStepProps {
  checks: ConsentFlags;
  onChange: (checks: ConsentFlags) => void;
  viewed: ConsentFlags;
  onViewedChange: (viewed: ConsentFlags) => void;
  onNext: () => void;
}

interface ConsentItemProps {
  id: ConsentType;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  viewed: boolean;
  onViewed: () => void;
  children: React.ReactNode;
}

// 화면 배율에 따라 스크롤 위치가 소수점으로 계산되어 끝까지 내려도 1px 안팎이 남을 수 있다.
const SCROLL_END_TOLERANCE_PX = 2;

const isScrolledToEnd = (element: HTMLElement) =>
  element.scrollHeight - element.scrollTop - element.clientHeight <= SCROLL_END_TOLERANCE_PX;

// 항목 한 줄(체크박스 + 제목 + 보기 버튼), 본문은 모달에 표시한다.
// 본문을 맨 아래까지 내려야 체크할 수 있다.
function ConsentItem({ id, label, checked, onCheckedChange, viewed, onViewed, children }: ConsentItemProps) {
  const markViewedAtEnd = (element: HTMLElement | null) => {
    if (element && !viewed && isScrolledToEnd(element)) onViewed();
  };

  return (
    <section className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          id={id}
          checked={checked}
          disabled={!viewed}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <Label htmlFor={id} className="font-medium">
          <span className="text-destructive">[필수]</span> {label}
        </Label>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="shrink-0" aria-label={`${label} 본문 보기`}>
            보기
          </Button>
        </DialogTrigger>
        <DialogContent className="gap-5 p-6 sm:max-w-2xl sm:p-8">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{label}</DialogTitle>
            <DialogDescription>
              시행일: {CONSENT_EFFECTIVE_DATE} (버전 {CONSENT_VERSIONS[id]})
            </DialogDescription>
          </DialogHeader>
          <div
            ref={markViewedAtEnd}
            onScroll={(e) => markViewedAtEnd(e.currentTarget)}
            tabIndex={0}
            role="region"
            aria-label={`${label} 본문`}
            className="grid max-h-[55svh] gap-4 overflow-y-auto rounded-md pr-3 text-base leading-relaxed outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {children}
          </div>
          <DialogFooter className="-mx-6 -mb-6 px-6 sm:-mx-8 sm:-mb-8 sm:items-center sm:px-8">
            <p role="status" className="text-muted-foreground sm:mr-auto">
              {viewed ? "본문을 모두 확인했습니다." : "맨 아래까지 내리면 동의할 수 있습니다."}
            </p>
            <DialogClose asChild>
              <Button type="button">닫기</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// 회원가입 1단계: 필수 동의 (본문을 끝까지 본 뒤 모두 체크해야 다음 단계)
// 개인정보처리자(회사명)를 밝혀야 해서 회사명을 받은 뒤에 본문을 보여 준다.
export function RegisterConsentStep({ checks, onChange, viewed, onViewedChange, onNext }: RegisterConsentStepProps) {
  const consentInfo = useConsentInfo();
  const companyName = consentInfo.data?.companyName;

  const allChecked = checks.TERMS_OF_SERVICE && checks.PRIVACY_COLLECTION;
  const someChecked = checks.TERMS_OF_SERVICE || checks.PRIVACY_COLLECTION;
  const allViewed = viewed.TERMS_OF_SERVICE && viewed.PRIVACY_COLLECTION;

  const setAll = (checked: boolean) => onChange({ TERMS_OF_SERVICE: checked, PRIVACY_COLLECTION: checked });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">서비스 이용 동의</h1>
        <p className="text-muted-foreground">각 항목의 보기를 눌러 내용을 끝까지 확인한 뒤 동의해 주세요.</p>
      </div>

      <div className="grid gap-5">
        {companyName ? (
          <>
            <div className="flex items-center gap-2 rounded-md border px-3 py-2.5">
              <Checkbox
                id="consent-all"
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                disabled={!allViewed}
                onCheckedChange={(value) => setAll(value === true)}
              />
              <Label htmlFor="consent-all" className="font-semibold">
                전체 동의
              </Label>
            </div>

            <ConsentItem
              id="TERMS_OF_SERVICE"
              label="이용약관 동의"
              checked={checks.TERMS_OF_SERVICE}
              onCheckedChange={(checked) => onChange({ ...checks, TERMS_OF_SERVICE: checked })}
              viewed={viewed.TERMS_OF_SERVICE}
              onViewed={() => onViewedChange({ ...viewed, TERMS_OF_SERVICE: true })}
            >
              {getTermsArticles(companyName).map((article) => (
                <div key={article.title} className="grid gap-1">
                  <h2 className="font-semibold">{article.title}</h2>
                  {article.clauses.map((clause) => (
                    <p key={clause}>{clause}</p>
                  ))}
                </div>
              ))}
            </ConsentItem>

            <ConsentItem
              id="PRIVACY_COLLECTION"
              label="개인정보 수집·이용 동의"
              checked={checks.PRIVACY_COLLECTION}
              onCheckedChange={(checked) => onChange({ ...checks, PRIVACY_COLLECTION: checked })}
              viewed={viewed.PRIVACY_COLLECTION}
              onViewed={() => onViewedChange({ ...viewed, PRIVACY_COLLECTION: true })}
            >
              <p>{companyName}(이하 “회사”)는 인트라넷 서비스 제공을 위해 아래와 같이 개인정보를 수집·이용합니다.</p>
              {PRIVACY_ROWS.map((row) => (
                <dl key={row.purpose} className="grid gap-1 border-t pt-2 first:border-t-0 first:pt-0">
                  <div>
                    <dt className="inline font-semibold">수집·이용 목적: </dt>
                    <dd className="inline font-semibold underline underline-offset-2">{row.purpose}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">수집 항목: </dt>
                    <dd className="inline">{row.items}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">보유·이용 기간: </dt>
                    <dd className="inline font-semibold underline underline-offset-2">{row.retention}</dd>
                  </div>
                </dl>
              ))}
              <ul className="grid list-disc gap-1 border-t pt-2 pl-4">
                {PRIVACY_NOTICES.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            </ConsentItem>
          </>
        ) : consentInfo.isError ? (
          <div className="grid gap-3">
            <FormError message="동의 내용을 불러오지 못했습니다." />
            <Button type="button" variant="outline" onClick={() => consentInfo.refetch()}>
              다시 시도
            </Button>
          </div>
        ) : (
          <Skeleton className="h-36 w-full" />
        )}

        <Button type="button" className="w-full" disabled={!companyName || !allChecked} onClick={onNext}>
          다음
        </Button>
      </div>

      <p className="text-center text-muted-foreground">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
