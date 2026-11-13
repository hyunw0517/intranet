import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditActionType, AuditTargetType, FacilityCategory, Users } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { isSameIdSet } from "src/common/util/id-set.util";
import { PrismaService } from "src/prisma/prisma.service";
import { UpdateSortOrderDto } from "src/organization/dto/update-sort-order.dto";
import { CreateFacilityCategoryDto } from "./dto/create-facility-category.dto";
import { UpdateFacilityCategoryDto } from "./dto/update-facility-category.dto";
import { checkCategorySettings, formatHm, parseHm } from "./util/reservation-rules.util";

//* 응답: 운영 시간을 "HH:mm"으로도 함께 준다. (입력과 같은 형식)
const toResponse = ( category: FacilityCategory ) => ({
    ...category,
    openTime: formatHm( category.openMinute ),
    closeTime: formatHm( category.closeMinute ),
});

//! 시설 분류 (관리자가 만든다: 회의실, 차량, 장비 …)
// 분류가 그 시설들의 예약 규칙(단위·운영 시간·요일·예약 가능 기간)을 정한다. (features.md 6장)
@Injectable()
export class FacilityCategoriesService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.FACILITY_CATEGORY );
    }

    //* 분류 목록 (정렬 순) - 예약 화면의 탭과 입력 제한에 쓰므로 모든 회원이 본다.
    async findAll() {
        const categories = await this.prisma.facilityCategory.findMany({
            where: { deleted: false },
            orderBy: [ { sortOrder: 'asc' }, { id: 'asc' } ],
        });

        return categories.map( toResponse );
    }

    //* 분류 생성
    async create( user: Pick<Users, 'id'>, body: CreateFacilityCategoryDto ) {
        await this.assertNameAvailable( body.name );
        const rules = this.toRules( body );

        const count = await this.prisma.facilityCategory.count({ where: { deleted: false } });

        return this.prisma.$transaction( async ( tx ) => {
            const category = await tx.facilityCategory.create({
                data: {
                    name: body.name,
                    sortOrder: count,
                    ...rules,
                    createdId: user.id,
                    updatedId: user.id,
                },
            });

            await this.audit.created( tx, category.id, `시설 분류 생성: ${category.name}`, { ...rules } );

            return toResponse( category );
        });
    }

    //* 분류 수정 - 규칙을 바꿔도 이미 있는 예약은 그대로 둔다. (새 예약부터 적용)
    async update( user: Pick<Users, 'id'>, id: number, body: UpdateFacilityCategoryDto ) {
        const before = await this.findOrThrow( id );

        if ( body.name !== undefined ) {
            await this.assertNameAvailable( body.name, id );
        }

        // 보낸 값과 기존 값을 합쳐 전체 규칙이 맞는지 확인한다. (운영 시작만 바꿔도 종료·단위와 함께 검사)
        const rules = this.toRules({
            slotMinutes: body.slotMinutes ?? before.slotMinutes,
            openTime: body.openTime ?? formatHm( before.openMinute ),
            closeTime: body.closeTime ?? formatHm( before.closeMinute ),
            operatingDays: body.operatingDays ?? before.operatingDays,
            maxAdvanceDays: body.maxAdvanceDays ?? before.maxAdvanceDays,
        });
        const data = { name: body.name, ...rules };

        return this.prisma.$transaction( async ( tx ) => {
            const category = await tx.facilityCategory.update({
                where: { id, deleted: false },
                data: { ...data, updatedId: user.id },
            });

            await this.audit.updated( tx, id, `시설 분류 수정: ${category.name}`, diffChanges( before, data ) );

            return toResponse( category );
        });
    }

    //* 분류 순서 변경 (드래그 정렬) - 직급·직책과 같은 방식: 현재 분류 전체의 id를 화면 순서대로 받는다.
    async updateOrder( user: Pick<Users, 'id'>, body: UpdateSortOrderDto ) {
        await this.prisma.$transaction( async ( tx ) => {
            const categories = await tx.facilityCategory.findMany({
                select: { id: true },
                where: { deleted: false },
                orderBy: [ { sortOrder: 'asc' }, { id: 'asc' } ],
            });

            if ( !isSameIdSet( categories.map( ( c ) => c.id ), body.ids ) ) {
                throw new BadRequestException( '시설 분류 목록이 변경되었습니다. 새로고침 후 다시 시도하세요.' );
            }

            for ( const [ index, id ] of body.ids.entries() ) {
                await tx.facilityCategory.update({ where: { id }, data: { sortOrder: index, updatedId: user.id } });
            }

            await this.audit.logBatch({
                targetIds: body.ids,
                actionType: AuditActionType.UPDATE,
                content: '시설 분류 순서 변경',
                extra: { orderBefore: categories.map( ( c ) => c.id ), orderAfter: body.ids },
            }, tx );
        });

        return true;
    }

    //* 분류 삭제 - 시설이 남아 있으면 409 (2026-11-09 사용자 결정. DB FK도 RESTRICT)
    async delete( user: Pick<Users, 'id'>, id: number ) {
        const category = await this.findOrThrow( id );

        const facilityCount = await this.prisma.facility.count({ where: { categoryId: id, deleted: false } });
        if ( facilityCount > 0 ) {
            throw new ConflictException( `시설이 남아 있는 분류는 삭제할 수 없습니다. (시설 ${facilityCount}개)` );
        }

        await this.prisma.$transaction( async ( tx ) => {
            await tx.facilityCategory.update({
                where: { id, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });

            // 삭제한 분류 뒤의 순서를 하나씩 당긴다.
            await tx.facilityCategory.updateMany({
                where: { sortOrder: { gt: category.sortOrder }, deleted: false },
                data: { sortOrder: { decrement: 1 } },
            });

            await this.audit.deleted( tx, id, `시설 분류 삭제: ${category.name}` );
        });

        return true;
    }

    private async findOrThrow( id: number ) {
        const category = await this.prisma.facilityCategory.findFirst({ where: { id, deleted: false } });
        if ( !category ) {
            throw new NotFoundException( '존재하지 않는 시설 분류입니다.' );
        }
        return category;
    }

    private async assertNameAvailable( name: string, exceptId?: number ) {
        const exists = await this.prisma.facilityCategory.findFirst({
            where: { name, deleted: false, id: exceptId ? { not: exceptId } : undefined },
        });
        if ( exists ) {
            throw new BadRequestException( '이미 존재하는 시설 분류명입니다.' );
        }
    }

    //* 입력("HH:mm", 요일) → 저장 값(분, 정렬된 요일) + 설정 검사
    private toRules( body: Pick<CreateFacilityCategoryDto, 'slotMinutes' | 'openTime' | 'closeTime' | 'operatingDays' | 'maxAdvanceDays'> ) {
        const openMinute = parseHm( body.openTime );
        const closeMinute = parseHm( body.closeTime );
        if ( openMinute === null || closeMinute === null ) {
            throw new BadRequestException( '운영 시간은 00:00 ~ 24:00 사이의 HH:mm 형식이어야 합니다.' );
        }

        const rules = {
            slotMinutes: body.slotMinutes,
            openMinute,
            closeMinute,
            operatingDays: [ ...new Set( body.operatingDays ) ].sort( ( a, b ) => a - b ),
            maxAdvanceDays: body.maxAdvanceDays,
        };

        const error = checkCategorySettings( rules );
        if ( error ) {
            throw new BadRequestException( error );
        }

        return rules;
    }
}
