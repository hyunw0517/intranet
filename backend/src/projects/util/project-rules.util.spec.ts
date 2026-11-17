//! project-rules.util.ts 단위 테스트 (진척도, 담당자 부재, 칸반 재정렬)
// DB를 쓰지 않는다. 규칙은 docs/design/projects.md 5장.

import { UserStatus } from 'src/generated/prisma/client';
import { calcProgress, isAssigneeAbsent, reorderColumn } from './project-rules.util';

describe('calcProgress - 진척도', () => {
    it.each([
        [ '과제 없음', 0, 0, 0 ],
        [ '절반 완료', 5, 10, 50 ],
        [ '전부 완료', 3, 3, 100 ],
        [ '소수점은 버림 (2/3 = 66.6…)', 2, 3, 66 ],
        [ '99.9%는 100%로 보이지 않음', 999, 1000, 99 ],
    ])( '%s → %s/%s = %s%', ( _label, done, total, expected ) => {
        expect( calcProgress( done, total ) ).toBe( expected );
    });
});

describe('isAssigneeAbsent - 담당자 부재', () => {
    const members = new Set([ 1, 2 ]);
    const user = ( id: number, status: UserStatus = UserStatus.ACTIVE, deleted = false ) => ({ id, status, deleted });

    it('담당자 없음(NULL)은 부재가 아니다', () => {
        expect( isAssigneeAbsent( null, members ) ).toBe( false );
    });
    it('활성 참여자 + 재직 → 부재 아님', () => {
        expect( isAssigneeAbsent( user( 1 ), members ) ).toBe( false );
    });
    it('참여자에서 빠짐 → 부재', () => {
        expect( isAssigneeAbsent( user( 3 ), members ) ).toBe( true );
    });
    it('참여자지만 퇴사 → 부재', () => {
        expect( isAssigneeAbsent( user( 1, UserStatus.RESIGNED ), members ) ).toBe( true );
    });
    it('참여자지만 삭제된 회원 → 부재', () => {
        expect( isAssigneeAbsent( user( 2, UserStatus.ACTIVE, true ), members ) ).toBe( true );
    });
    it('휴직(INACTIVE)은 부재가 아니다 (돌아올 수 있음)', () => {
        expect( isAssigneeAbsent( user( 1, UserStatus.INACTIVE ), members ) ).toBe( false );
    });
});

describe('reorderColumn - 칸반 재정렬', () => {
    it('다른 컬럼에서 온 카드를 중간에 넣는다', () => {
        expect( reorderColumn( [ 10, 11, 12 ], 99, 1 ) ).toEqual([ 10, 99, 11, 12 ]);
    });
    it('같은 컬럼 안에서 뒤로 옮긴다 (원래 자리는 빠진다)', () => {
        expect( reorderColumn( [ 10, 11, 12 ], 10, 2 ) ).toEqual([ 11, 12, 10 ]);
    });
    it('맨 앞으로', () => {
        expect( reorderColumn( [ 10, 11, 12 ], 12, 0 ) ).toEqual([ 12, 10, 11 ]);
    });
    it('범위를 넘는 위치는 맨 끝, 음수는 맨 앞', () => {
        expect( reorderColumn( [ 10, 11 ], 99, 100 ) ).toEqual([ 10, 11, 99 ]);
        expect( reorderColumn( [ 10, 11 ], 99, -5 ) ).toEqual([ 99, 10, 11 ]);
    });
    it('빈 컬럼', () => {
        expect( reorderColumn( [], 99, 0 ) ).toEqual([ 99 ]);
    });
});
