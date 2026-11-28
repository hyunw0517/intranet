import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { kstDateString } from "./util/date.util";
import { Holiday, parseHolidayXml } from "./util/holiday-xml.util";

const HOLIDAY_API_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

const QUERYABLE_YEARS_AROUND = 2;                       // 올해 앞뒤로 조회할 수 있는 연도 수
const SUCCESS_CACHE_MS = 24 * 60 * 60 * 1000;           // 성공 결과 보관 (임시공휴일 지정을 하루 안에 반영)
const FAILURE_CACHE_MS = 10 * 60 * 1000;                // 실패 후 다시 호출하기까지의 대기
const REQUEST_TIMEOUT_MS = 5000;

//! 공휴일: 한국천문연구원 특일 정보 API를 서버에서 호출해 연도별로 메모리에 캐시한다.
// API 키를 브라우저에 노출하지 않고, 접속자 수와 상관없이 외부 호출 수를 일정하게 둔다 (일일 한도 10,000건).
// 외부 API가 실패해도 달력은 동작해야 해서 예외 대신 이전 결과나 빈 목록을 준다.
@Injectable()
export class HolidaysService {

    private readonly logger = new Logger( HolidaysService.name );
    private readonly cache = new Map<number, { holidays: Holiday[]; expiresAt: number }>();
    private readonly pending = new Map<number, Promise<Holiday[]>>();   // 진행 중인 호출 (동시 요청은 호출 1번으로 합친다)

    constructor(
        private readonly configService: ConfigService,
    ){}

    //* 그해 공휴일 (범위 밖 연도는 빈 목록 - 임의의 연도로 호출 한도를 쓰지 못하게)
    async findByYear( year: number ): Promise<Holiday[]> {
        const thisYear = Number( kstDateString( new Date() ).slice( 0, 4 ) );
        if ( Math.abs( year - thisYear ) > QUERYABLE_YEARS_AROUND ) return [];

        const cached = this.cache.get( year );
        if ( cached && cached.expiresAt > Date.now() ) return cached.holidays;

        const running = this.pending.get( year );
        if ( running ) return running;

        const request = this.refresh( year, cached?.holidays ?? [] ).finally( () => this.pending.delete( year ) );
        this.pending.set( year, request );

        return request;
    }

    private async refresh( year: number, previous: Holiday[] ): Promise<Holiday[]> {
        try {
            const holidays = await this.fetchYear( year );
            this.cache.set( year, { holidays, expiresAt: Date.now() + SUCCESS_CACHE_MS } );
            return holidays;
        } catch ( error ) {
            this.logger.warn( `${year}년 공휴일 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}` );
            this.cache.set( year, { holidays: previous, expiresAt: Date.now() + FAILURE_CACHE_MS } );
            return previous;
        }
    }

    private async fetchYear( year: number ): Promise<Holiday[]> {
        const key = this.configService.get<string>( 'HOLIDAY_API_KEY' );
        if ( !key ) throw new Error( 'HOLIDAY_API_KEY가 설정되지 않았습니다.' );

        // 공공데이터포털 키는 인코딩·디코딩 두 가지가 있고, 인코딩된 키를 다시 인코딩하면 인증에 실패한다
        const serviceKey = /%[0-9A-Fa-f]{2}/.test( key ) ? key : encodeURIComponent( key );
        const response = await fetch( `${HOLIDAY_API_URL}?serviceKey=${serviceKey}&solYear=${year}&numOfRows=100`, {
            signal: AbortSignal.timeout( REQUEST_TIMEOUT_MS ),
        });

        if ( !response.ok ) throw new Error( `HTTP ${response.status}` );

        return parseHolidayXml( await response.text() );
    }
}
