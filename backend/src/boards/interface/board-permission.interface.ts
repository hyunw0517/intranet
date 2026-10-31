// 권한 구분용 인터페이스
export interface BoardPermission {
    read: boolean;
    write: boolean;
    comment: boolean;
    admin: boolean;
}

export type BoardAction = keyof BoardPermission; 