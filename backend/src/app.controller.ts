import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { IsPublic } from './common/decorator/is-public.decorator';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @IsPublic()
  @ApiExcludeEndpoint() // 앱 기동 확인용(e2e). API 문서에는 넣지 않는다
  getHello(): string {
    return this.appService.getHello();
  }
}
