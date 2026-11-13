import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AddonName, parseAddons } from "src/config/addons.config";

//* 켜진 애드온 목록 (핵심 공통 모듈)
// - 애드온 모듈을 import하지 않는다. 이름 목록(config/addons.config.ts)만 안다.
// - 핵심 모듈이라 항상 생성되므로, 생성자에서 ADDONS를 검사해 설정 오류(모르는 이름, 본체 없는 옵션)면 서버 시작을 멈춘다.
//   (애드온 모듈 등록 쪽 검사는 그 애드온이 하나라도 AppModule에 있어야 실행되기 때문)
@Injectable()
export class AddonsService {

    private readonly enabled: AddonName[];

    constructor( configService: ConfigService ) {
        this.enabled = parseAddons( configService.get<string>( 'ADDONS' ) );
    }

    findEnabled() {
        return { enabled: [ ...this.enabled ] };
    }

    isEnabled( name: AddonName ) {
        return this.enabled.includes( name );
    }
}
