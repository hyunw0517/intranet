import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AddonName, parseAddons } from "src/config/addons.config";

//* 켜진 애드온 목록 (애드온 모듈은 import하지 않고 이름 목록만 안다)
// 핵심 모듈이라 항상 생성되므로, 여기서 ADDONS 설정 오류를 검사해 서버 시작을 멈춘다.
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
