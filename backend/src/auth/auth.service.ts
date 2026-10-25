import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfigService } from '@nestjs/config';
import { ENV_HASH_ROUNDS_KEY, ENV_JWT_SECRET } from 'src/common/const/env-keys.const';
import { Users, UserStatus } from 'src/generated/prisma/client';
import { REFRESH_TOKEN_EXPIRES_IN } from './const/refresh-cookie-const';

@Injectable()
export class AuthService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ){}

    /**
     * *[토큰 사용 방식]
     * 1) 사용자가 로그인 또는 회원가입 진행 시 
     *      accessToken, refreshToken 발급
     * 2) 로그인 시 Basic 토큰과 함께 요청을 받는다. 
     *      Basic 토큰은 '이메일:비밀번호'를 Base64로 인코딩한 형태이다. 
     *      ex) { authorization: 'Basic {token}' }
     * 3) 아무나 접근할 수 없는 정보 (private route)를 접근 할 때는
     *      accessToken을 Header에 추가해서 요청과 함께 보낸다. 
     *      ex) { authorization: 'Bearer {token}' }
     * 4) 토큰과 요청을 함께 받은 서버는 토큰 검증을 통해 현재 요청을 보낸 사용자가 누군지 알 수 있다. 
     *    예를 들어, 현재 로그인 한 사용자가 작성한 포스트만 가져오려면 
     *    토큰의 sub 값에 입력되어 있는 사용자의 포스트만 따로 필터링 할 수 있다. 
     *    특정 사용자의 토큰이 없다면 다른 사용자의 데이터 접근 불가하다. 
     * 5) 모든 토큰은 만료 기간이 있다. 만료 기간이 지나면 새로 토큰을 발급 받아야 한다. 
     *    그렇지 않으면 jwtService.verify()에서 인증 통과가 불가하다. 
     *    access 토큰을 새로 발급 받을 수 있는 /auth/token/access, 
     *    refresh 토큰을 새로 발급 받을 수 있는 /auth/token/refresh 필요
     * 6) 토큰이 만료되면 각각의 토큰을 새로 발급 받을 수 있는 엔드포인트에 요청해서 
     *    새로운 토큰을 발급 받고 해당 토큰으로 private route에 접근한다. 
     */

    // 헤더 값 검증 후 토큰 값만 반환
    extractTokenFromHeader( header: string, isBearer: boolean ){
      const splitToken = header.split(' ');
      const prefix = isBearer ? 'Bearer' : 'Basic';

      if( splitToken.length !== 2 || splitToken[0] !== prefix ){
        throw new UnauthorizedException('잘못된 토큰입니다.');
      }

      const token = splitToken[1]; 

      return token; 
    }

    /**
     * * Basic 토큰 decode
     * - empNo:password -> [empNo, password]
     */
    decodeBasicToken( base64String: string ){
        const decoded = Buffer.from(base64String, 'base64').toString('utf8'); // base64를 utf8로 디코딩

        const idx = decoded.indexOf(':');

        if( idx <= 0 ){
            throw new UnauthorizedException('잘못된 유형의 토큰입니다.');
        }

        const empNo = decoded.slice(0, idx); 
        const password = decoded.slice(idx + 1); 

        return {
            empNo, 
            password, 
        }
    }

    //* 토큰 검증
    verifyToken( token: string ){
      try{
        return this.jwtService.verify(token, {
          secret: this.configService.get<string>(ENV_JWT_SECRET), 
        });
      }catch(e){
        throw new UnauthorizedException('유효하지 않거나 만료된 토큰입니다.');
      }
    }

    //* 토큰 재발급
    rotateToken( token: string, isRefreshToken: boolean ){

      const decoded = this.verifyToken(token);

      // sub: id,
      // empNo: empNo, 
      // type: 'access' | 'refresh'
      // ver: tokenVersion
      if( decoded.type !== 'refresh' ){
        throw new UnauthorizedException('잘못된 토큰 방식입니다.'); 
      }

      return this.signToken({
        id: decoded.sub,
        empNo: decoded.empNo, 
        tokenVersion: decoded.ver,
      }, isRefreshToken);
    }

  //* 토큰 생성
  //      - 3)에서 필요한 accessToken, refreshToken을 sign하는 로직 (토큰 생성)
  signToken( 
    user: Pick<Users, 'id' | 'empNo' | 'tokenVersion'>, 
    isRefreshToken: boolean 
  ){
    const payload = {
        empNo: user.empNo,
        sub: user.id,
        type: isRefreshToken ? 'refresh' : 'access',
        ver: user.tokenVersion, // DB의 tokenVersion과 다르면 무효 토큰
    };

    return this.jwtService.sign(payload, {
        secret: this.configService.get<string>(ENV_JWT_SECRET), 
        // 유효시간 (unit: seconds) 
        expiresIn: isRefreshToken ? REFRESH_TOKEN_EXPIRES_IN : 600, 
    });
  }

  //* 로그인 시 accessToken, refreshToken 발급
  loginUser( user: Pick<Users, 'id' | 'empNo' | 'tokenVersion'> ) {
      return {
          accessToken: this.signToken(user, false), 
          refreshToken: this.signToken(user, true), 
      }
  }

  //* 로그인 시 사번/패스워드 검증
  async authenticateWithEmpNoAndPassword(
    user: Pick<Users, 'empNo' | 'password'>
  ){
      // 1. 사용자가 존재하는지 확인 (empNo)
      // 2. 비밀번호가 맞는지 확인 
      // 3. 모두 통과되면 찾은 사용자 정보 반환
      
      const existingUser = await this.usersService.getUserWithPasswordByEmpNo(user.empNo);

      if( !existingUser ) {
          throw new UnauthorizedException('존재하지 않는 사용자입니다.'); 
      }

      await this.usersService.verifyPassword( existingUser, user.password, 'login' );

      return existingUser;
  }

  //* 사용자 상태 체크 -> 재직(ACTIVE) 상태만 로그인 허용
  checkUserStatus(
    user: Pick<Users, 'status'>
  ){
      switch( user.status ) {
          case UserStatus.ACTIVE:
              return;
          case UserStatus.INACTIVE:
              throw new ForbiddenException('비활성화된 계정입니다. 관리자에게 문의하세요.');
          case UserStatus.RESIGNED:
              throw new ForbiddenException('퇴사 처리된 계정입니다.');
          default:
              throw new ForbiddenException('로그인할 수 없는 계정입니다.');
      }
  }

  //* 비밀번호 해시 생성
  //    - 회원가입, 비밀번호 변경에서 공통으로 사용
  hashPassword(
    password: string
  ){
    return bcrypt.hash(
        password,
        parseInt(
          this.configService.get<string>(ENV_HASH_ROUNDS_KEY) ?? '10'
        ),
    );
  }

  //* 회원가입
  async registerWithEmpNo(
    user: RegisterUserDto, 
  ){

    const hash = await this.hashPassword(user.password);

    const newUser = await this.usersService.createUser({
      empNo: user.empNo,
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      password: hash,
      birthday: user.birthday,
      hp: user.hp,
      tel: user.tel,
    });

    return this.loginUser(newUser);
  }

  //* 비밀번호 변경
  //    - 본인 확인을 위해 현재 비밀번호를 먼저 검증한다.
  //    - 새 비밀번호가 현재 비밀번호와 같으면 변경하지 않는다.
  //    - tokenVersion이 올라가 기존 토큰(다른 기기 포함)은 모두 무효가 되므로,
  //      현재 사용자에게는 새 토큰을 발급해 응답한다.
  async changePassword(
    user: Pick<Users, 'id'>, 
    body: ChangePasswordDto
  ){
    const hash = await this.usersService.getPasswordHashById(user.id);
    await this.usersService.verifyPassword({ password: hash }, body.currentPassword, 'confirm');

    if( body.currentPassword === body.newPassword ){
      throw new BadRequestException('새 비밀번호가 현재 비밀번호와 같습니다.');
    }

    const newHash = await this.hashPassword(body.newPassword);

    const updatedUser = await this.usersService.updatePassword(user.id, newHash);

    return this.loginUser(updatedUser);
  }

  //* (관리자) 비밀번호 초기화
  //    - 서버가 임시 비밀번호를 생성해 저장하고, 평문은 응답으로 한 번만 돌려준다. (DB에는 해시만 저장)
  //    - updatePassword가 tokenVersion을 올리므로 대상 회원의 기존 토큰은 모두 무효가 된다.
  //    - 변경 대상이 관리자 본인이 아니므로 토큰을 발급하지 않는다.
  async resetPassword( 
    userId: number 
  ){
    await this.usersService.getUserDetail(userId);

    const temporaryPassword = this.generateTemporaryPassword();

    const newHash = await this.hashPassword(temporaryPassword);

    await this.usersService.updatePassword(userId, newHash);

    return { temporaryPassword };
  }

  //* 임시 비밀번호 생성 (12자리)
  //    - Math.random()은 예측 가능하므로 비교적 안전한 crypto.randomInt 사용.
  private generateTemporaryPassword(){
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';

    let password = '';
    for( let i = 0; i < 12; i++ ){
      password += chars[randomInt(chars.length)];
    }

    return password;
  }

}
