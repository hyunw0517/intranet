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

//! 시설 예약 (애드온 'reservations')
// controllers 순서: ReservationsController를 마지막에 둔다.
// 배열 순서대로 라우트가 등록돼서, 먼저 두면 GET /reservations/categories가 :id로 잡혀 400이 된다.
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
