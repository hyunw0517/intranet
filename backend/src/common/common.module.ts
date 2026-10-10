import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { CommonController } from './common.controller';
import { UsersModule } from 'src/users/users.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [CommonController],
  providers: [CommonService],
  exports: [CommonService],
  imports: [
     AuthModule,
     UsersModule,
  ],
})
export class CommonModule {}
