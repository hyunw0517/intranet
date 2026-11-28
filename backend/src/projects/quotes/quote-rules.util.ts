import { ApprovalStatus, Prisma, ProjectQuoteStatus, ProjectQuoteTaxType } from "src/generated/prisma/client";

//! 견적서 순수 규칙 (DB 없이 단위 테스트)

// 금액 최대값: Decimal(15,0) (원화 정수, 999조)
export const MAX_AMOUNT = new Prisma.Decimal( '999999999999999' );
// 부가세율(%) 기본값 - 견적·매출·협력사 모두 직접 입력하고 기본은 10
export const DEFAULT_VAT_RATE = 10;

//* 부가세 = floor(공급가액 × 부가세율 ÷ 100) (원 미만 버림), 면세면 0
// 견적·매출·협력사 공용. Decimal로 계산해 정밀도 손실이 없다.
export function calcVat( supply: Prisma.Decimal, taxType: ProjectQuoteTaxType, vatRate: number | string | Prisma.Decimal = DEFAULT_VAT_RATE ): Prisma.Decimal {
    if ( taxType !== ProjectQuoteTaxType.TAXABLE ) return new Prisma.Decimal( 0 );
    return supply.mul( vatRate ).div( 100 ).floor();
}

//* 부가세율 표시 "10" / "3.3" (불필요한 0 제거)
export function formatVatRate( vatRate: number | string | Prisma.Decimal ): string {
    return new Prisma.Decimal( vatRate ).toString();
}

//* 화면에 보여 주는 견적 상태 (저장 상태 + 결재 문서 상태)
export type QuoteDisplayStatus = 'DRAFT' | 'IN_APPROVAL' | 'REJECTED' | 'CONFIRMED' | 'CANCELLED';

// 결재 중으로 보는 결재 문서 상태 (이 동안은 수정·새 버전·다시 상신 불가)
const IN_APPROVAL: ApprovalStatus[] = [ ApprovalStatus.REQUESTED, ApprovalStatus.IN_PROGRESS ];

//* 표시 상태 계산
// 작성 중이면 결재 문서를 본다: 진행 중이면 결재 중, 반려면 반려, 그 밖에는 작성 중
export function quoteDisplayStatus( status: ProjectQuoteStatus, approvalStatus: ApprovalStatus | null | undefined ): QuoteDisplayStatus {
    if ( status !== ProjectQuoteStatus.DRAFT ) return status;
    if ( approvalStatus && IN_APPROVAL.includes( approvalStatus ) ) return 'IN_APPROVAL';
    if ( approvalStatus === ApprovalStatus.REJECTED ) return 'REJECTED';
    return 'DRAFT';
}

//* 고칠 수 있는 상태인지 (작성 중·반려)
export function isQuoteEditable( display: QuoteDisplayStatus ): boolean {
    return display === 'DRAFT' || display === 'REJECTED';
}

export interface QuoteItemInput {
    name: string;
    spec?: string | null;
    quantity: number;
    unitPrice: number;
    note?: string | null;
}

//* 품목 금액 + 합계 계산
// - 금액 = 수량 × 단가 (곱이 2^53을 넘을 수 있어 Decimal로 계산)
// - 부가세는 합계 기준으로 원 미만 버림, 면세는 0
// - 어느 금액이든 999조를 넘으면 null (호출한 쪽이 400)
export function calcQuote( items: QuoteItemInput[], taxType: ProjectQuoteTaxType, vatRate: number | string | Prisma.Decimal = DEFAULT_VAT_RATE ) {
    const rows = items.map( ( item, i ) => ({
        ...item,
        sortOrder: i,
        unitPrice: new Prisma.Decimal( item.unitPrice ),
        amount: new Prisma.Decimal( item.unitPrice ).mul( item.quantity ),
    }) );

    const supplyAmount = rows.reduce( ( sum, r ) => sum.add( r.amount ), new Prisma.Decimal( 0 ) );
    const vatAmount = calcVat( supplyAmount, taxType, vatRate );
    const totalAmount = supplyAmount.add( vatAmount );

    const overflow = rows.some( ( r ) => r.amount.gt( MAX_AMOUNT ) ) || totalAmount.gt( MAX_AMOUNT );
    return overflow ? null : { rows, supplyAmount, vatAmount, totalAmount };
}

//* 견적번호 "Q-2026-0001"
export function formatQuoteNo( year: number, no: number ): string {
    return `Q-${year}-${String( no ).padStart( 4, '0' )}`;
}

//* HTML 특수문자 이스케이프 (서버가 만드는 결재 본문에 사용자 입력을 넣을 때)
export function escapeHtml( value: string | null | undefined ): string {
    return ( value ?? '' )
        .replace( /&/g, '&amp;' )
        .replace( /</g, '&lt;' )
        .replace( />/g, '&gt;' )
        .replace( /"/g, '&quot;' )
        .replace( /'/g, '&#39;' );
}

//* 금액 표시 "12,000,000원" (문자열 자릿수만 끊는다 - 정밀도 손실 없음)
export function formatWon( value: Prisma.Decimal | string | number ): string {
    return `${value.toString().replace( /\B(?=(\d{3})+(?!\d))/g, ',' )}원`;
}

export interface QuoteHtmlSource {
    quoteNo: string;
    version: number;
    title: string;
    projectName: string;
    taxType: ProjectQuoteTaxType;
    vatRate: number | string | Prisma.Decimal; // 부가세율(%)
    quoteDate: string;       // "YYYY-MM-DD"
    validUntil: string | null;
    clientName: string;
    clientBusinessNo: string | null;
    contactName: string | null;
    items: { name: string; spec: string | null; quantity: number; unitPrice: Prisma.Decimal | string; amount: Prisma.Decimal | string; note: string | null }[];
    supplyAmount: Prisma.Decimal | string;
    vatAmount: Prisma.Decimal | string;
    totalAmount: Prisma.Decimal | string;
    note: string | null;
}

//* 결재 문서 본문 (상신 시 스냅샷, 결재 화면이 과제 관리를 몰라도 보여 주도록)
// 공용 정제 허용 목록 안의 태그만 쓰고, 사용자 입력은 모두 이스케이프한다.
export function buildQuoteHtml( q: QuoteHtmlSource ): string {
    const bno = q.clientBusinessNo?.length === 10
        ? `${q.clientBusinessNo.slice( 0, 3 )}-${q.clientBusinessNo.slice( 3, 5 )}-${q.clientBusinessNo.slice( 5 )}`
        : q.clientBusinessNo;

    const info = [
        `<strong>견적번호</strong> ${escapeHtml( q.quoteNo )} v${q.version}`,
        `<strong>프로젝트</strong> ${escapeHtml( q.projectName )}`,
        `<strong>발주처</strong> ${escapeHtml( q.clientName )}${bno ? ` (${escapeHtml( bno )})` : ''}${q.contactName ? ` · ${escapeHtml( q.contactName )} 님` : ''}`,
        `<strong>견적일</strong> ${q.quoteDate}${q.validUntil ? ` · <strong>유효기간</strong> ${q.validUntil}까지` : ''}`,
        `<strong>과세</strong> ${q.taxType === ProjectQuoteTaxType.TAXABLE ? `과세 (부가세 ${formatVatRate( q.vatRate )}%)` : '면세'}`,
    ].map( ( line ) => `<p>${line}</p>` ).join( '' );

    const rows = q.items.map( ( item, i ) => `<tr><td>${i + 1}</td><td>${escapeHtml( item.name )}</td><td>${escapeHtml( item.spec )}</td>`
        + `<td>${item.quantity}</td><td>${formatWon( item.unitPrice )}</td><td>${formatWon( item.amount )}</td><td>${escapeHtml( item.note )}</td></tr>` ).join( '' );

    const table = `<table><thead><tr><th>No</th><th>품목</th><th>규격</th><th>수량</th><th>단가</th><th>금액</th><th>비고</th></tr></thead>`
        + `<tbody>${rows}</tbody>`
        + `<tfoot><tr><td></td><td>공급가액</td><td></td><td></td><td></td><td>${formatWon( q.supplyAmount )}</td><td></td></tr>`
        + `<tr><td></td><td>부가세</td><td></td><td></td><td></td><td>${formatWon( q.vatAmount )}</td><td></td></tr>`
        + `<tr><td></td><td><strong>합계</strong></td><td></td><td></td><td></td><td><strong>${formatWon( q.totalAmount )}</strong></td><td></td></tr></tfoot></table>`;

    const note = q.note ? `<p><strong>비고</strong> ${escapeHtml( q.note )}</p>` : '';
    return `${info}${table}${note}`;
}
