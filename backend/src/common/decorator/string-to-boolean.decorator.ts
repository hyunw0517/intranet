import { Transform } from "class-transformer";

// 쿼리스트링의 'true' / 'false' 문자열을 boolean으로 변환한다.
// 그 외 값은 그대로 두어 @IsBoolean()에서 걸러지게 한다.
export const StringToBoolean = () => Transform( ({ value }) => {
    if (value === 'true') {
        return true;
    }

    if (value === 'false') {
        return false;
    }

    return value;
});