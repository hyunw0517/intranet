import { DynamicModule, Type } from "@nestjs/common";
import { ConditionalModule } from "@nestjs/config";

//! 애드온 ON/OFF (AGENTS.md 10.1, 2026-11-09 사용자 결정)
// - backend/.env의 ADDONS에 켤 애드온 이름을 쉼표로 나열한다. ex) ADDONS=reservations,approvals,leaves
// - 변수가 없거나 비어 있으면 전부 꺼짐(핵심만 동작). 명시한 것만 켠다.
// - 꺼진 애드온은 AppModule에 모듈이 등록되지 않아 API 자체가 없다(404). 데이터는 지우지 않는다.
// - 이름이 틀렸거나 옵션의 본체가 꺼져 있으면 서버가 시작 단계에서 멈춘다. (AddonsService 생성자에서 검사)
// - 플러그인 로더처럼 모듈을 동적으로 찾지 않는다. 목록은 여기, 등록은 AppModule에서 addonModule()로 직접 쓴다.

//* 애드온 목록 + 필요한 본체 (옵션은 본체가 켜져 있을 때만 켤 수 있다)
// 순서 = 켜진 애드온 목록 API 응답 순서
export const ADDONS = {
    reservations: { requires: [] },             // 회의실 예약
    approvals: { requires: [] },                // 전자결재
    leaves: { requires: [ 'approvals' ] },      // 휴가(연차) - 결재의 옵션
    chats: { requires: [] },                    // 채팅
} as const satisfies Record<string, { requires: readonly string[] }>;

export type AddonName = keyof typeof ADDONS;

const ADDON_NAMES = Object.keys( ADDONS ) as AddonName[];

const isAddonName = ( value: string ): value is AddonName => ( ADDON_NAMES as string[] ).includes( value );

//* ADDONS 값 → 켜진 애드온 목록 (ADDONS에 정의한 순서, 중복 제거)
// - 공백은 무시한다. ex) "reservations, approvals"
// - 모르는 이름, 본체 없이 켠 옵션은 오류 (설정 실수가 조용히 "꺼짐"으로 넘어가지 않게)
export function parseAddons( value: string | undefined ): AddonName[] {
    const names = ( value ?? '' ).split( ',' ).map( ( name ) => name.trim() ).filter( ( name ) => name !== '' );

    const unknown = names.filter( ( name ) => !isAddonName( name ) );
    if ( unknown.length > 0 ) {
        throw new Error( `ADDONS에 알 수 없는 애드온이 있습니다: ${unknown.join( ', ' )} (사용 가능: ${ADDON_NAMES.join( ', ' )})` );
    }

    const enabled = ADDON_NAMES.filter( ( name ) => names.includes( name ) );

    for ( const name of enabled ) {
        const missing = ADDONS[name].requires.filter( ( required ) => !( enabled as string[] ).includes( required ) );
        if ( missing.length > 0 ) {
            throw new Error( `애드온 ${name}은(는) ${missing.join( ', ' )}이(가) 켜져 있어야 합니다. ADDONS를 확인하세요.` );
        }
    }

    return enabled;
}

//* AppModule imports에서 사용: ADDONS에 name이 있을 때만 module을 등록한다.
// - ConfigModule.forRoot()는 .env를 비동기로 읽어서, imports 배열을 만드는 시점에는 process.env.ADDONS가 아직 없을 수 있다.
//   ConditionalModule.registerWhen은 .env 로드가 끝난 뒤 조건을 판단한다. (@nestjs/config 공식 기능)
// ex) imports: [ ..., addonModule( 'reservations', ReservationsModule ) ]
export function addonModule( name: AddonName, module: Type ): Promise<DynamicModule> {
    return ConditionalModule.registerWhen( module, ( env ) => parseAddons( env.ADDONS ).includes( name ), { debug: false } );
}
