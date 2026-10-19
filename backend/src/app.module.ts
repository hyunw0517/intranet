import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { AccessTokenGuard } from './auth/guard/bearer-token.guard';
import { APP_GUARD } from '@nestjs/core/constants';
import { RolesGuard } from './auth/guard/roles.guard';
import { OrganizationModule } from './organization/organization.module';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      envFilePath: '.env', 
      isGlobal: true 
    }), 
    PrismaModule, 
    CommonModule, 
    UsersModule, 
    AuthModule, 
    OrganizationModule, 
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
