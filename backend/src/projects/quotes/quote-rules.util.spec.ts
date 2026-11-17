//! quote-rules.util.ts 단위 테스트 (견적 금액·부가세, 표시 상태, 견적번호, 결재 본문 HTML)
// DB를 쓰지 않는다. 규칙은 docs/design/projects.md 5-1장.

import { ApprovalStatus, ProjectQuoteStatus, ProjectQuoteTaxType } from 'src/generated/prisma/client';
import { sanitizeEditorHtml } from 'src/common/util/sanitize-html.util';
import { buildQuoteHtml, calcQuote, formatQuoteNo, isQuoteEditable, quoteDisplayStatus } from './quote-rules.util';

describe('calcQuote - 금액·부가세', () => {
    it('금액 = 수량 × 단가, 과세는 합계 기준 10% 원 미만 버림', () => {
        // 공급가액 33,333 → 부가세 3,333.3 → 3,333 (버림)
        const r = calcQuote( [ { name: 'A', quantity: 3, unitPrice: 11_111 } ], ProjectQuoteTaxType.TAXABLE )!;
        expect( r.rows[0].amount.toString() ).toBe( '33333' );
        expect( r.supplyAmount.toString() ).toBe( '33333' );
        expect( r.vatAmount.toString() ).toBe( '3333' );
        expect( r.totalAmount.toString() ).toBe( '36666' );
    });

    it('행 단위가 아니라 합계 기준으로 버린다 (행마다 버리면 1원 적어지는 경우)', () => {
        // 행별 부가세: 0.5 + 0.5 → 버리면 0 / 합계 기준: 10 × 10% = 1
        const r = calcQuote( [ { name: 'A', quantity: 1, unitPrice: 5 }, { name: 'B', quantity: 1, unitPrice: 5 } ], ProjectQuoteTaxType.TAXABLE )!;
        expect( r.vatAmount.toString() ).toBe( '1' );
    });

    it('면세는 부가세 0', () => {
        const r = calcQuote( [ { name: 'A', quantity: 2, unitPrice: 1000 } ], ProjectQuoteTaxType.EXEMPT )!;
        expect( r.vatAmount.toString() ).toBe( '0' );
        expect( r.totalAmount.toString() ).toBe( '2000' );
    });

    it('품목이 없으면 0원', () => {
        const r = calcQuote( [], ProjectQuoteTaxType.TAXABLE )!;
        expect( r.totalAmount.toString() ).toBe( '0' );
    });

    it('999조까지는 정확히 계산하고, 넘으면 null (품목 금액·합계·부가세를 더한 값 모두)', () => {
        const over = calcQuote( [ { name: 'A', quantity: 3, unitPrice: 400_000_000_000_000 } ], ProjectQuoteTaxType.EXEMPT );
        expect( over ).toBeNull(); // 1,200조

        const ok = calcQuote( [ { name: 'A', quantity: 3, unitPrice: 333_333_333_333_333 } ], ProjectQuoteTaxType.EXEMPT )!;
        expect( ok.totalAmount.toString() ).toBe( '999999999999999' );

        const vatOver = calcQuote( [ { name: 'A', quantity: 1, unitPrice: 999_999_999_999_999 } ], ProjectQuoteTaxType.TAXABLE );
        expect( vatOver ).toBeNull(); // 부가세를 더하면 넘는다
    });
});

describe('quoteDisplayStatus - 표시 상태', () => {
    it.each([
        [ '작성 중, 결재 없음', ProjectQuoteStatus.DRAFT, null, 'DRAFT' ],
        [ '결재 상신됨', ProjectQuoteStatus.DRAFT, ApprovalStatus.REQUESTED, 'IN_APPROVAL' ],
        [ '결재 진행 중', ProjectQuoteStatus.DRAFT, ApprovalStatus.IN_PROGRESS, 'IN_APPROVAL' ],
        [ '반려', ProjectQuoteStatus.DRAFT, ApprovalStatus.REJECTED, 'REJECTED' ],
        [ '회수', ProjectQuoteStatus.DRAFT, ApprovalStatus.CANCELLED, 'DRAFT' ],
        [ '확정', ProjectQuoteStatus.CONFIRMED, ApprovalStatus.APPROVED, 'CONFIRMED' ],
        [ '확정 취소', ProjectQuoteStatus.CANCELLED, ApprovalStatus.APPROVED, 'CANCELLED' ],
    ])( '%s → %s', ( _label, status, approval, expected ) => {
        expect( quoteDisplayStatus( status, approval ) ).toBe( expected );
    });

    it('고칠 수 있는 것은 작성 중·반려뿐', () => {
        expect( [ 'DRAFT', 'IN_APPROVAL', 'REJECTED', 'CONFIRMED', 'CANCELLED' ].filter( ( s ) => isQuoteEditable( s as never ) ) ).toEqual([ 'DRAFT', 'REJECTED' ]);
    });
});

describe('formatQuoteNo', () => {
    it.each([ [ 1, 'Q-2026-0001' ], [ 123, 'Q-2026-0123' ], [ 12345, 'Q-2026-12345' ] ])( '%s → %s', ( no, expected ) => {
        expect( formatQuoteNo( 2026, no ) ).toBe( expected );
    });
});

describe('buildQuoteHtml - 결재 본문', () => {
    const source = {
        quoteNo: 'Q-2026-0001', version: 2, title: '견적', projectName: '<b>프로젝트</b>', taxType: ProjectQuoteTaxType.TAXABLE,
        quoteDate: '2026-11-17', validUntil: '2026-12-17', clientName: '가나상사', clientBusinessNo: '1234567890', contactName: '김담당',
        items: [ { name: '<script>x</script>설계', spec: null, quantity: 2, unitPrice: '1000', amount: '2000', note: null } ],
        supplyAmount: '2000', vatAmount: '200', totalAmount: '2200', note: null,
    };

    it('사용자 입력은 이스케이프되고, 공용 정제를 거쳐도 표와 내용이 그대로 남는다', () => {
        const html = buildQuoteHtml( source );
        expect( html ).toContain( '&lt;b&gt;프로젝트&lt;/b&gt;' );
        expect( html ).not.toContain( '<script>' );
        expect( html ).toContain( '123-45-67890' );
        expect( html ).toContain( '2,200원' );

        // 결재 서비스는 본문을 다시 정제한다 → 표가 지워지면 안 된다
        expect( sanitizeEditorHtml( html, { allowImage: () => false } ).html ).toBe( html );
    });
});
