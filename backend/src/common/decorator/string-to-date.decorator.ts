import { Transform } from "class-transformer";

// JSON의 날짜 문자열을 Date 타입으로 변환
// 시간대가 있는 값만 변환한다. 시간대가 없으면 서버 환경에 따라 해석이 달라지기 때문.
// 그 외 값은 그대로 두어 @IsDate()에서 거름. 
const ISO_WITH_TIMEZONE = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export const StringToDate = () => Transform( ({ value }) => {
    if ( typeof value !== 'string' ) {
        return value;
    }

    const match = ISO_WITH_TIMEZONE.exec(value);
    if ( !match ) {
        return value;
    }

    // new Date는 없는 날짜(2월 30일)를 다음 달로 넘겨 버리므로 연·월·일이 그대로인지 확인한다.
    // 없는 날짜는 Invalid Date로 바꿔 @IsDate()에서 거름.
    const [ , year, month, day ] = match.map(Number);
    const check = new Date( Date.UTC(year, month - 1, day) );
    if ( check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day ) {
        return new Date(NaN);
    }

    return new Date(value);
});
