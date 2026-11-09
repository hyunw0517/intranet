//! tree.util.ts 단위 테스트
// toTreeList: 부서·게시판·댓글처럼 "상위 id"로 연결된 목록을 트리 순서의 평평한 목록으로 바꾼다.
// ex) [사업본부, 인사팀(상위: 경영지원본부), 경영지원본부] → 경영지원본부 / 경영지원본부/인사팀 / 사업본부
// 각 항목에 depth(들여쓰기 단계)와 path(최상위부터의 이름)를 붙여 프론트가 그대로 그릴 수 있게 한다.
// DB를 쓰지 않는다. 직접 만든 배열을 넣고 결과 순서를 비교한다.

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

    // 기본 동작: 부모 바로 뒤에 자식이 온다(전위 순회). 손자(채용파트)는 인사팀 바로 뒤, 총무팀보다 앞.
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

    // DB 조회 순서(orderBy)에 기대지 않는지 확인: 자식이 부모보다 먼저 와도 결과는 같아야 한다.
    it('입력 순서와 관계없이 같은 결과를 낸다', () => {
        const shuffled = [ departments[5], departments[2], departments[4], departments[0], departments[3], departments[1] ];

        expect( toTreeList( shuffled, ( d ) => d.parentId ) ).toEqual( toTreeList( departments, ( d ) => d.parentId ) );
    });

    // 같은 상위의 형제끼리는 관리자가 정한 sortOrder 순. sortOrder가 같으면(B·C) id가 작은 쪽이 먼저 → 순서가 매번 같게 고정
    it('형제 순서는 sortOrder, 같으면 id 순이다', () => {
        const result = toTreeList(
            [ dept( 3, 'C', null, 1 ), dept( 2, 'B', null, 1 ), dept( 1, 'A', null, 2 ) ],
            ( d ) => d.parentId,
        );

        expect( result.map( ( d ) => d.id ) ).toEqual([ 2, 3, 1 ]);
    });

    // 상위 부서가 삭제돼 목록에 없으면(parentId 99) 그 하위가 결과에서 통째로 사라지면 안 된다 → 최상위로 보여 준다.
    it('상위가 목록에 없는 항목(고아)은 최상위로 올려 빠뜨리지 않는다', () => {
        const result = toTreeList( [ dept( 1, '본부', null, 1 ), dept( 7, '삭제된 상위의 팀', 99, 2 ) ], ( d ) => d.parentId );

        expect( summarize( result ) ).toEqual([ '0:본부', '0:삭제된 상위의 팀' ]);
    });

    // 댓글 트리: 이름·sortOrder가 없으므로 정렬 함수(작성 시각 순)를 세 번째 인자로 넘긴다. path는 쓰지 않아 빈 문자열.
    // createdAt은 실제로는 Date지만 여기서는 숫자로 단순화했다. 결과: 먼저 쓴 댓글 2 → 댓글 1 → 1의 답글 3
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
