//! tree.util.ts 단위 테스트
// toTreeList: 상위 id로 연결된 목록을 트리 순서의 평평한 목록으로 (depth, path 포함)

import { toTreeList } from './tree.util';

interface Dept {
    id: number;
    name: string;
    sortOrder: number;
    parentId: number | null;
}

const dept = ( id: number, name: string, parentId: number | null, sortOrder = 0 ): Dept => ({ id, name, sortOrder, parentId });

// 결과를 "깊이:경로" 문자열로 줄여 순서를 한눈에 비교한다.
const summarize = ( list: { depth: number; path: string }[] ) => list.map( ( d ) => `${d.depth}:${d.path}` );

describe('toTreeList', () => {
    // 테스트용 부서 트리 (3단계)
    // 경영지원본부(1)
    //  ├ 인사팀(3)
    //  │  └ 채용파트(6)
    //  └ 총무팀(4)
    // 사업본부(2)
    //  └ 영업팀(5)
    const departments = [
        dept( 1, '경영지원본부', null, 1 ),
        dept( 2, '사업본부', null, 2 ),
        dept( 3, '인사팀', 1, 1 ),
        dept( 4, '총무팀', 1, 2 ),
        dept( 5, '영업팀', 2, 1 ),
        dept( 6, '채용파트', 3, 1 ),
    ];

    // 부모 바로 뒤에 자식이 온다(전위 순회). 채용파트는 인사팀 바로 뒤, 총무팀보다 앞
    it('전위 순회 순서로 depth와 path를 붙인다 (3단계)', () => {
        const result = toTreeList( departments, ( d ) => d.parentId );

        expect( summarize( result ) ).toEqual([
            '0:경영지원본부',
            '1:경영지원본부/인사팀',
            '2:경영지원본부/인사팀/채용파트',
            '1:경영지원본부/총무팀',
            '0:사업본부',
            '1:사업본부/영업팀',
        ]);
    });

    // 자식이 부모보다 먼저 와도 결과는 같아야 한다
    it('입력 순서와 관계없이 같은 결과를 낸다', () => {
        const shuffled = [ departments[5], departments[2], departments[4], departments[0], departments[3], departments[1] ];

        expect( toTreeList( shuffled, ( d ) => d.parentId ) ).toEqual( toTreeList( departments, ( d ) => d.parentId ) );
    });

    // 형제는 sortOrder 순, 같으면 id 순
    it('형제 순서는 sortOrder, 같으면 id 순이다', () => {
        const result = toTreeList(
            [ dept( 3, 'C', null, 1 ), dept( 2, 'B', null, 1 ), dept( 1, 'A', null, 2 ) ],
            ( d ) => d.parentId,
        );

        expect( result.map( ( d ) => d.id ) ).toEqual([ 2, 3, 1 ]);
    });

    // 상위가 목록에 없으면(삭제) 하위가 사라지지 않고 최상위로 나온다
    it('상위가 목록에 없는 항목(고아)은 최상위로 올려 빠뜨리지 않는다', () => {
        const result = toTreeList( [ dept( 1, '본부', null, 1 ), dept( 7, '삭제된 상위의 팀', 99, 2 ) ], ( d ) => d.parentId );

        expect( summarize( result ) ).toEqual([ '0:본부', '0:삭제된 상위의 팀' ]);
    });

    // 댓글은 sortOrder가 없어서 정렬 함수를 넘긴다 (createdAt은 숫자로 단순화)
    it('이름이 없는 트리(댓글)는 compare로 정렬하고 path는 빈 문자열이다', () => {
        const comments = [
            { id: 1, parentCommentId: null, createdAt: 2 },
            { id: 2, parentCommentId: null, createdAt: 1 },
            { id: 3, parentCommentId: 1, createdAt: 3 },
        ];

        const result = toTreeList( comments, ( c ) => c.parentCommentId, ( a, b ) => a.createdAt - b.createdAt || a.id - b.id );

        expect( result.map( ( c ) => [ c.id, c.depth, c.path ] ) ).toEqual([ [ 2, 0, '' ], [ 1, 0, '' ], [ 3, 1, '' ] ]);
    });

    // 경계값: 부서가 하나도 없을 때 오류 없이 빈 배열
    it('빈 목록이면 빈 결과', () => {
        expect( toTreeList( [] as Dept[], ( d ) => d.parentId ) ).toEqual( [] );
    });
});
