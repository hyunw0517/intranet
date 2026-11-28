export interface Holiday {
    date: string;   // yyyy-MM-dd
    name: string;
}

const XML_ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' };

const readTag = ( xml: string, tag: string ) => xml.match( new RegExp( `<${tag}>([^<]*)</${tag}>` ) )?.[1].trim();

//* 한국천문연구원 특일 정보(getRestDeInfo) XML 응답 → 공휴일 목록 (날짜순)
// 필요한 값이 세 개뿐이라 XML 라이브러리를 쓰지 않는다. 같은 날 공휴일이 겹치면 이름을 합친다.
export function parseHolidayXml( xml: string ): Holiday[] {
    const resultCode = readTag( xml, 'resultCode' );
    if ( resultCode !== '00' ) {
        throw new Error( `공휴일 API 오류 코드: ${resultCode ?? readTag( xml, 'returnReasonCode' ) ?? '알 수 없는 응답'}` );
    }

    const names = new Map<string, string[]>();
    for ( const [ , item ] of xml.matchAll( /<item>([\s\S]*?)<\/item>/g ) ) {
        const locdate = readTag( item, 'locdate' );
        const name = readTag( item, 'dateName' );
        if ( readTag( item, 'isHoliday' ) !== 'Y' || !name || !locdate || !/^\d{8}$/.test( locdate ) ) continue;

        const date = `${locdate.slice( 0, 4 )}-${locdate.slice( 4, 6 )}-${locdate.slice( 6 )}`;
        const decoded = name.replace( /&(?:lt|gt|quot|apos|amp);/g, ( entity ) => XML_ENTITIES[entity] );
        names.set( date, [ ...new Set( [ ...( names.get( date ) ?? [] ), decoded ] ) ] );
    }

    return [ ...names.entries() ]
        .sort( ( [ a ], [ b ] ) => a.localeCompare( b ) )
        .map( ( [ date, dateNames ] ) => ({ date, name: dateNames.join( ', ' ) }) );
}
