import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {

    constructor(configService: ConfigService) {
        const adapter = new PrismaPg({
            connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        });

        super({ 
            adapter, 
            omit: {
                users: {
                    password: true, // 패스워드는 조회에서 기본으로 제외되도록 (필요하면 service에서 명시)
                },
            },
        });
    }

    async onModuleInit() {
        // Initialization logic here
        await this.$connect();
    }

    async onModuleDestroy() {
        // Cleanup logic here
        await this.$disconnect();
    }
}
