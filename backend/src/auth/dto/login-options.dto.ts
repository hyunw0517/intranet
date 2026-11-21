import { IsBoolean, IsOptional } from "class-validator";

//* 로그인 옵션 (사번·비밀번호는 Basic 헤더로 받는다)
export class LoginOptionsDto {
    /**
     * 로그인 유지 - false면 브라우저를 닫을 때 refresh 쿠키가 사라진다. 값이 없으면 유지(true)로 처리한다.
     * @example true
     */
    @IsOptional()
    @IsBoolean()
    rememberMe?: boolean;
}
