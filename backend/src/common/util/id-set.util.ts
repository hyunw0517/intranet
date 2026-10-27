//* 두 id 목록이 같은 집합인지 (순서 무관, 중복 불가)
// 순서 변경 API에서 "현재 DB 목록 전체를 빠짐없이, 중복 없이 보냈는지" 확인할 때 사용한다.
// - 빠진 id, 없는 id, 중복 id가 있으면 false
export function isSameIdSet( currentIds: number[], requestIds: number[] ): boolean {
    const requestSet = new Set( requestIds );

    if( requestSet.size !== requestIds.length ){
        return false; // 중복
    }

    if( requestSet.size !== currentIds.length ){
        return false; // 개수 불일치 (빠짐 또는 초과)
    }

    return currentIds.every( ( id ) => requestSet.has( id ) );
}
