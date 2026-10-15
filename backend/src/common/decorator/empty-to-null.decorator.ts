import { Transform } from "class-transformer";

// 문자열 앞뒤 공백을 제거하고, 빈 문자열이면 null로 변환한다.
// update 시 null은 "값 지우기"로 처리되므로 nullable 컬럼에만 사용한다.
export const EmptyToNull = () => Transform( ({ value }) => {
    if (typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();

    return trimmed === '' ? null : trimmed;
});
