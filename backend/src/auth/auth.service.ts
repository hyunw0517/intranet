import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcrypt';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { ConfigService } from '@nestjs/config';
import { ENV_HASH_ROUNDS_KEY, ENV_JWT_SECRET } from 'src/common/const/env-keys.const';
import { Users } from 'src/generated/prisma/client';

@Injectable()
export class AuthService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ){}

    // 헤더 값 검증 후 토큰 값 반환
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
     * 1) Basic 토큰 decode
     * 2) empNo:password -> [empNo, password]
     * 3) {empNo: empNo, password: password}
     */
    decodeBasicToken(base64String: string){
        const decoded = Buffer.from(base64String, 'base64').toString('utf8'); // base64를 utf8로 디코딩

        const split = decoded.split(':'); 

        if( split.length !== 2 ){
            throw new UnauthorizedException('잘못된 유형의 토큰입니다.');
        }

        const empNo = split[0]; 
        const password = split[1]; 

        return {
            empNo, 
            password, 
        }
    }

    // 토큰 검증
    verifyToken(token: string){
      try{
        return this.jwtService.verify(token, {
          secret: this.configService.get<string>(ENV_JWT_SECRET), 
        });
      }catch(e){
        throw new UnauthorizedException('토큰이 만료되었습니다.');
      }
    }

    rotateToken(token: string, isRefreshToken: boolean){
      const decoded = this.jwtService.verify(token, {
        secret: this.configService.get<string>(ENV_JWT_SECRET), 
      });

      // sub: id, 
      // empNo: empNo, 
      // type: 'access' | 'refresh'
      if( decoded.type !== 'refresh' ){
        throw new UnauthorizedException('잘못된 토큰 방식입니다.'); 
      }

      return this.signToken({
        id: decoded.sub,
        empNo: decoded.empNo, 
      }, isRefreshToken);
    }

  // signToken
  //      - 3)에서 필요한 accessToken, refreshToken을 sign하는 로직 (토큰 생성)
  signToken( user: Pick<Users, 'id' | 'empNo'>, isRefreshToken: boolean ){
    const payload = {
        empNo: user.empNo,
        sub: user.id,
        type: isRefreshToken ? 'refresh' : 'access',
    };

    return this.jwtService.sign(payload, {
        secret: this.configService.get<string>(ENV_JWT_SECRET), 
        // 유효기간 (unit: seconds) 
        expiresIn: isRefreshToken ? 3600 : 300, 
    });
  }

  // 로그인 시 accessToken, refreshToken 발급
  loginUser(user: Pick<Users, 'id' | 'empNo'>) {
      return {
          accessToken: this.signToken(user, false), 
          refreshToken: this.signToken(user, true), 
      }
  }

  // authenticateWithEmpNoAndPassword
  //      - 2)에서 로그인 진행할 때 필요한 기본적인 검증 진행
  async authenticateWithEmpNoAndPassword(user: Pick<Users, 'empNo' | 'password'>) {
      // 1. 사용자가 존재하는지 확인 (empNo)
      // 2. 비밀번호가 맞는지 확인 
      // 3. 모두 통과되면 찾은 사용자 정보 반환
      
      const existingUser = await this.usersService.getUserByEmpNo(user.empNo);

      if( !existingUser ) {
          throw new UnauthorizedException('존재하지 않는 사용자입니다.'); 
      }

      /**
       * 파라미터
       * 1) 입력된 비밀번호
       * 2) 기존 해시(hash) -> 사용자 정보에 저장되어 있는 hash
       */
      const passOk = await bcrypt.compare( user.password, existingUser.password );

      if( !passOk ){
          throw new UnauthorizedException('비밀번호가 일치하지 않습니다.'); 
      }

      return existingUser;
  }
  
  // loginWithEmpNo
  //      - empNo, password 입력 받고 사용자 검증 진행
  //      - 5)에서 검증이 완료되면 accessToken, refreshToken 반환
  async loginWithEmpNo(user: Pick<Users, 'empNo' | 'password'>){
      const existingUser = await this.authenticateWithEmpNoAndPassword(user);

      return this.loginUser(existingUser);
  }

  // 회원가입
  async registerWithEmpNo(user: RegisterUserDto){

    const hash = await bcrypt.hash(
        user.password, 
        parseInt( 
          this.configService.get<string>(ENV_HASH_ROUNDS_KEY) ?? '10' 
        ), 
    );

    const newUser = await this.usersService.createUser({
      empNo: user.empNo,
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      password: hash,
      birthday: user.birthday,
    });

    return this.loginUser(newUser);
  }



  /*create(createAuthDto: CreateAuthDto) {
    return 'This action adds a new auth';
  }

  findAll() {
    return `This action returns all auth`;
  }

  findOne(id: number) {
    return `This action returns a #${id} auth`;
  }

  update(id: number, updateAuthDto: UpdateAuthDto) {
    return `This action updates a #${id} auth`;
  }

  remove(id: number) {
    return `This action removes a #${id} auth`;
  }*/
}
