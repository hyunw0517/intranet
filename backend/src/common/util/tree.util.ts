// 자기 참조 트리(부서, 게시판 등)를 트리 순서의 평평한 목록으로 변환한다.
// ex) 경영지원본부 / 경영지원본부/인사팀 / 경영지원본부/총무팀 / 사업본부 / 사업본부/영업팀 ...

interface TreeItem {
    id: number;
    name: string;
    sortOrder: number;
}

export type TreeListItem<T> = T & {
    depth: number; // 최상위 0부터
    path: string;  // 최상위부터 자기까지의 이름 (구분자 /)
};

//* items: 전체 목록 (조회 순서 무관), getParentId: 상위 id를 꺼내는 함수
export function toTreeList<T extends TreeItem>(
    items: T[],
    getParentId: ( item: T ) => number | null,
): TreeListItem<T>[] {
    // 상위 id → 하위 목록
    // 상위가 없거나 목록에 없으면(삭제 등) 최상위로 취급해 결과에서 빠지지 않게 한다.
    const ids = new Set( items.map( ( item ) => item.id ) );
    const childrenMap = new Map<number | null, T[]>();

    for ( const item of items ) {
        const parentId = getParentId( item );
        const key = parentId !== null && ids.has( parentId ) ? parentId : null;

        const children = childrenMap.get( key ) ?? [];
        children.push( item );
        childrenMap.set( key, children );
    }

    // 형제 간 순서: sortOrder → id (조회 쿼리의 orderBy와 관계없이 순서 고정)
    for ( const children of childrenMap.values() ) {
        children.sort( ( a, b ) => a.sortOrder - b.sortOrder || a.id - b.id );
    }

    // 전위 순회: 자기 자신을 먼저 넣고, 그 다음 하위 항목들을 순서대로 넣는다.
    const result: TreeListItem<T>[] = [];

    const visit = ( parentId: number | null, depth: number, parentPath: string ) => {
        for ( const item of childrenMap.get( parentId ) ?? [] ) {
            const path = parentPath ? `${parentPath}/${item.name}` : item.name;

            result.push({ ...item, depth, path });
            visit( item.id, depth + 1, path );
        }
    };

    visit( null, 0, '' );

    return result;
}
