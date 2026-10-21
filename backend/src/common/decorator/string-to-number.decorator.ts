import { Transform } from "class-transformer";

// 쿼리스트링의 수 문자열을 number 타입으로 변환한다.
// 그 외 값은 그대로 두어 @IsNumber()에서 거름. 
export const StringToNumber = () => Transform( ({ value }) => {
    if ( typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ) {
        return Number(value);
    }

    return value;
});