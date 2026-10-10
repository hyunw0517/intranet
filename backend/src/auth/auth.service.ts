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

  // 로그인 시 accessToken, refreshToken 발급
  loginUser(user: Pick<Users, 'id' | 'email'>) {
      /*return {
          accessToken: this.signToken(user, false), 
          refreshToken: this.signToken(user, true), 
      }*/
     return user;
  }

  // 회원가입
  async registerWithEmail(user: RegisterUserDto){

    const hash = await bcrypt.hash(
        user.password, 
        parseInt( 
          this.configService.get<string>(ENV_HASH_ROUNDS_KEY) ?? '10' 
        ), 
    );

    const newUser = await this.usersService.createUser({
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
