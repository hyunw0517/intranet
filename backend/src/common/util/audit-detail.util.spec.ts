//! audit-detail.util.ts 단위 테스트
// 감사 로그 detail에 바뀐 내용을 남기는 함수들 (diffChanges, batchChanges, toAuditJson)

import { batchChanges, diffChanges, toAuditJson } from './audit-detail.util';

//* 단건 수정: 바뀐 필드만 골라내기
describe('diffChanges (단건 변경 내용)', () => {
    // 이름만 바꿨으면 이름만 남고, 같은 값으로 보낸 email은 빠진다
    it('바뀐 필드만 변경 전/후로 남긴다', () => {
        const before = { name: '홍길동', email: 'a@test.com', role: 'USER' };

        expect( diffChanges( before, { name: '김철수', email: 'a@test.com' } ) ).toEqual({
            name: { before: '홍길동', after: '김철수' },
        });
    });

    // 보내지 않은(undefined) 필드는 "지웠다"가 아니라 "건드리지 않았다"로 본다
    it('수정 값에 없는(undefined) 필드는 수정하지 않은 것으로 본다', () => {
        expect( diffChanges( { name: '홍길동' }, { name: undefined } ) ).toEqual( {} );
    });

    // Date는 === 로 비교하면 같은 시각이어도 다르다고 나와서 시각 값으로 비교한다
    it('Date는 객체가 아니라 시각 값으로 비교한다', () => {
        const before = { joinAt: new Date( '2026-01-01T00:00:00Z' ) };

        expect( diffChanges( before, { joinAt: new Date( '2026-01-01T00:00:00Z' ) } ) ).toEqual( {} );
        expect( diffChanges( before, { joinAt: new Date( '2026-02-01T00:00:00Z' ) } ) ).toHaveProperty( 'joinAt' );
    });

    // null과 undefined는 같은 "값 없음"으로 보고, before에는 null로 남긴다 (JSON에 undefined가 저장되지 않아서)
    it('null과 undefined(없는 값)는 같게 보고, 변경 전 값이 없으면 null로 남긴다', () => {
        expect( diffChanges( { memo: null }, { memo: null } ) ).toEqual( {} );
        expect( diffChanges( {}, { memo: '새 메모' } ) ).toEqual({ memo: { before: null, after: '새 메모' } });
    });

    // 배열은 내용으로 비교한다. 순서가 바뀌면 변경으로 본다
    it('배열은 내용으로 비교한다', () => {
        expect( diffChanges( { ids: [ 1, 2 ] }, { ids: [ 1, 2 ] } ) ).toEqual( {} );
        expect( diffChanges( { ids: [ 1, 2 ] }, { ids: [ 2, 1 ] } ) ).toHaveProperty( 'ids' );
    });

    // 비밀번호·토큰 해시는 값이 바뀌어도 감사 로그에 남기지 않는다
    it('비밀번호·토큰 필드는 바뀌어도 남기지 않는다', () => {
        const changes = diffChanges( { password: 'old-hash', tokenHash: 'a' }, { password: 'new-hash', tokenHash: 'b' } );

        expect( changes ).toEqual( {} );
    });
});

//* 일괄 처리: 여러 대상의 변경 전 값을 한 행에 모으기
describe('batchChanges (일괄 변경 내용)', () => {
    // 여러 회원을 한 번에 바꾸면 변경 전 값이 회원마다 달라서 pk별로 남긴다
    it('대상마다 다른 변경 전 값을 pk별로 모은다', () => {
        const rows = [ { id: 5, role: 'GUEST' }, { id: 7, role: 'USER' } ];

        expect( batchChanges( rows, 'role', 'ADMIN' ) ).toEqual({
            role: { before: { '5': 'GUEST', '7': 'USER' }, after: 'ADMIN' },
        });
    });

    // 변경 전 값이 비어 있던 대상도 키가 빠지지 않고 null로 남는지
    it('변경 전 값이 없으면 null', () => {
        const rows: { id: number; memo: string | null }[] = [ { id: 1, memo: null } ];

        expect( batchChanges( rows, 'memo', '메모' ) ).toEqual({ memo: { before: { '1': null }, after: '메모' } });
    });
});

//* DB 저장 직전 변환: JSON으로 저장할 수 있는 값으로
describe('toAuditJson (Json 컬럼 값 변환)', () => {
    // Date는 ISO 문자열로, BigInt는 JSON.stringify가 실패해서 문자열로 바꾼다. undefined 필드는 사라진다
    it('Date는 ISO 문자열, BigInt는 문자열로 바꾸고 undefined 필드는 뺀다', () => {
        const result = toAuditJson({
            at: new Date( '2026-11-09T00:00:00.000Z' ),
            id: 12345678901234567890n,
            skip: undefined,
        });

        expect( result ).toEqual({ at: '2026-11-09T00:00:00.000Z', id: '12345678901234567890' });
    });

    // detail을 직접 만든 곳에서 실수로 password·currentJti를 넣어도 어느 깊이든 지워지는지
    it('민감 필드는 어느 깊이에 있든 제거한다', () => {
        const result = toAuditJson({
            changes: { password: { before: 'a', after: 'b' }, name: { before: 'x', after: 'y' } },
            session: { currentJti: 'jti', deviceName: 'Chrome' },
        });

        expect( result ).toEqual({
            changes: { name: { before: 'x', after: 'y' } },
            session: { deviceName: 'Chrome' },
        });
    });
});
