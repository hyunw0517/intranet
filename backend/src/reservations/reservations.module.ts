import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesService } from './facilities.service';
import { FacilityCategoriesController } from './facility-categories.controller';
import { FacilityCategoriesService } from './facility-categories.service';
import { FacilityUnavailableController } from './facility-unavailable.controller';
import { FacilityUnavailableService } from './facility-unavailable.service';
import { ReservationNotifier } from './reservation-notifier';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

//! 시설 예약 (애드온 'reservations') - AppModule에서 addonModule('reservations', ReservationsModule)로만 등록한다.
// 핵심(common)의 감사 로그·알림을 직접 쓴다. (애드온 → 핵심 허용, 핵심은 이 모듈을 모른다)
// controllers 순서: 'reservations/:id'를 가진 ReservationsController를 마지막에 둔다.
//   Nest는 배열 순서대로 라우트를 등록하므로, 먼저 두면 GET /reservations/categories가 :id = "categories"로 잡혀 400이 된다.
@Module({
    imports: [ PrismaModule, CommonModule ],
    controllers: [
        FacilityCategoriesController,
        FacilityUnavailableController,
        FacilitiesController,
        ReservationsController,
    ],
    providers: [
        FacilityCategoriesService,
        FacilitiesService,
        FacilityUnavailableService,
        ReservationsService,
        ReservationNotifier,
    ],
})
export class ReservationsModule {}
