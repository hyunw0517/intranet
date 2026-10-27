"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PageMeta } from "@/types/pagination";

const WINDOW = 5; // 한 번에 보여 줄 페이지 번호 수

// 현재 페이지를 가운데에 두고 최대 WINDOW개의 번호를 만든다. (1~5, 3~7, ... 끝에서는 마지막 5개)
function pageNumbers(page: number, totalPages: number) {
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1));
  const end = Math.min(totalPages, start + WINDOW - 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// 페이지 기반 목록 하단의 페이지 이동 (백엔드 PageResult.meta 사용)
// 1페이지뿐이어도 표시해 현재 위치와 전체 페이지 수를 알 수 있게 한다.
export function PaginationBar({ meta, onPageChange }: { meta: PageMeta; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(meta.totalPages, 1); // 결과가 0건이면 서버는 totalPages 0

  return (
    <nav aria-label="페이지 이동" className="flex items-center justify-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!meta.hasPrevious}
        onClick={() => onPageChange(meta.page - 1)}
        aria-label="이전 페이지"
      >
        <ChevronLeft />
      </Button>
      {pageNumbers(meta.page, totalPages).map((n) => (
        <Button
          key={n}
          variant={n === meta.page ? "outline" : "ghost"}
          size="icon-sm"
          className="tabular-nums"
          onClick={() => n !== meta.page && onPageChange(n)}
          aria-label={`${n}페이지`}
          aria-current={n === meta.page ? "page" : undefined}
        >
          {n}
        </Button>
      ))}
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!meta.hasNext}
        onClick={() => onPageChange(meta.page + 1)}
        aria-label="다음 페이지"
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}
