import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { IsPublic } from 'src/common/decorator/is-public.decorator';
import { RefreshTokenGuard } from './guard/bearer-token.guard';
import { BasicTokenGuard } from './guard/basic-token.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  //* Bearer -> Access 토큰 재발급 
  @Post('token/access')
  @IsPublic()
  @UseGuards(RefreshTokenGuard)
  postTokenAccess( @Headers('authorization') rawToken: string ){
    const token = this.authService.extractTokenFromHeader(rawToken, true);

    // { accessToken: {token} }
    const newToken = this.authService.rotateToken(token, false);

    return {
      accessToken: newToken, 
    };
  }
  
  //* Bearer -> Refresh 토큰 재발급 
  @Post('token/refresh')
  @IsPublic()
  @UseGuards(RefreshTokenGuard)
  postTokenRefresh( @Headers('authorization') rawToken: string ){
    const token = this.authService.extractTokenFromHeader(rawToken, true);

    // { refreshToken: {token} }
    const newToken = this.authService.rotateToken(token, true);

    return {
      refreshToken: newToken, 
    };
  }

  //* 회원 로그인 요청
  @Post('login/emp')
  @IsPublic()
  @UseGuards(BasicTokenGuard)
  postLoginEmpNo(
    // @Body('empNo') empNo: string, 
    // @Body('password') password: string, 
    @Headers( 'authorization' ) rawToken: string, 
    // @Request() req, 
  ){
    // empNo:password -> base64
    const token = this.authService.extractTokenFromHeader(rawToken, false); 

    const credentials = this.authService.decodeBasicToken(token); 
    //credentials -> { empNo: empNo, password: password }; 

    return this.authService.loginWithEmpNo( credentials );
  }

  @Post('register/emp')
  @IsPublic()
  postRegisterEmpNo(
    @Body() body: RegisterUserDto
  ){
    return this.authService.registerWithEmpNo(
      body,
    );
  }

}
