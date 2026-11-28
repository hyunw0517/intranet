import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditActionType, AuditTargetType, Prisma, Users } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { PaginatePage } from "src/common/util/pagination.util";
import { PrismaService } from "src/prisma/prisma.service";
import {
    CreateProjectClientContactDto, CreateProjectClientDto, ProjectClientListQueryDto,
    UpdateProjectClientContactDto, UpdateProjectClientDto,
} from "./dto/project-client.dto";

type Actor = Pick<Users, 'id'>;

const DUPLICATE_BUSINESS_NO = '같은 사업자등록번호의 거래처가 이미 있습니다.';

const contactSelect = {
    id: true, name: true, department: true, jobTitle: true, hp: true, email: true, memo: true,
} satisfies Prisma.ProjectClientContactSelect;

//! 거래처 + 거래처 담당자
// - USER 이상 누구나 등록·수정·삭제·복구한다. 등록자가 퇴사해도 다른 사람이 고칠 수 있게 등록자로 묶지 않는다.
// - 삭제해도 기존 프로젝트·견적에는 실제 이름이 그대로 보인다.
// - 사업자등록번호는 삭제되지 않은 거래처끼리 중복 금지 (서비스 검사 + DB 부분 unique).
@Injectable()
export class ProjectClientsService {

    private readonly audit: TargetAudit;
    private readonly contactAudit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.PROJECT_CLIENT );
        this.contactAudit = auditService.target( AuditTargetType.PROJECT_CLIENT_CONTACT );
    }

    //* 거래처 목록 (삭제 안 된 것, 회사명 순)
    findAll( query: ProjectClientListQueryDto ) {
        const where = this.listWhere( query.search, false );
        return PaginatePage( query,
            ( page ) => this.prisma.projectClient.findMany({
                where,
                // 발주 프로젝트 수(projects) / 협력 프로젝트 수(partners) - 역할은 회사가 아니라 연결에서 계산한다
                include: {
                    _count: {
                        select: {
                            contacts: { where: { deleted: false } },
                            projects: { where: { deleted: false } },
                            partners: { where: { deleted: false, project: { deleted: false } } },
                        },
                    },
                },
                orderBy: [ { name: 'asc' }, { id: 'asc' } ],
                ...page,
            }),
            () => this.prisma.projectClient.count({ where }),
        );
    }

    //* [삭제된 거래처] 탭 - 삭제한 사람·시각 (최근 삭제 순)
    async findDeleted( query: ProjectClientListQueryDto ) {
        const where = this.listWhere( query.search, true );
        const result = await PaginatePage( query,
            ( page ) => this.prisma.projectClient.findMany({
                where,
                orderBy: [ { deletedAt: 'desc' }, { id: 'desc' } ],
                ...page,
            }),
            () => this.prisma.projectClient.count({ where }),
        );

        const names = await this.userNames( result.data.map( ( c ) => c.deletedId ) );
        return {
            ...result,
            data: result.data.map( ( c ) => ({ ...c, deletedBy: c.deletedId ? { id: c.deletedId, name: names.get( c.deletedId ) ?? null } : null }) ),
        };
    }

    //* 상세 + 담당자 목록 (삭제된 거래처도 본다 - 기존 프로젝트에서 들어올 수 있어서)
    async findOne( id: number ) {
        const client = await this.prisma.projectClient.findUnique({
            where: { id },
            include: {
                contacts: { where: { deleted: false }, select: contactSelect, orderBy: { id: 'asc' } },
                _count: { select: { projects: { where: { deleted: false } }, partners: { where: { deleted: false, project: { deleted: false } } } } },
            },
        });
        if ( !client ) {
            throw new NotFoundException( '존재하지 않는 거래처입니다.' );
        }
        return client;
    }

    async create( user: Actor, body: CreateProjectClientDto ) {
        if ( body.businessNo ) {
            await this.assertBusinessNoAvailable( body.businessNo );
        }

        return this.withDuplicateGuard( () => this.prisma.$transaction( async ( tx ) => {
            const client = await tx.projectClient.create({
                data: {
                    name: body.name,
                    businessNo: body.businessNo,
                    ceoName: body.ceoName,
                    address: body.address,
                    tel: body.tel,
                    memo: body.memo,
                    createdId: user.id,
                    updatedId: user.id,
                },
            });
            await this.audit.created( tx, client.id, `거래처 등록: ${client.name}`, { businessNo: client.businessNo } );
            return client;
        }) );
    }

    async update( user: Actor, id: number, body: UpdateProjectClientDto ) {
        const before = await this.findActive( id );
        if ( body.businessNo && body.businessNo !== before.businessNo ) {
            await this.assertBusinessNoAvailable( body.businessNo, id );
        }

        const data = {
            name: body.name,
            businessNo: body.businessNo,
            ceoName: body.ceoName,
            address: body.address,
            tel: body.tel,
            memo: body.memo,
        };

        return this.withDuplicateGuard( () => this.prisma.$transaction( async ( tx ) => {
            const client = await tx.projectClient.update({
                where: { id, deleted: false },
                data: { ...data, updatedId: user.id },
            });
            await this.audit.updated( tx, id, `거래처 수정: ${client.name}`, diffChanges( before, data ) );
            return client;
        }) );
    }

    //* 삭제 - 연결된 프로젝트가 있어도 삭제한다(연결은 유지)
    async delete( user: Actor, id: number ) {
        const client = await this.findActive( id );

        await this.prisma.$transaction( async ( tx ) => {
            await tx.projectClient.update({
                where: { id, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });
            await this.audit.deleted( tx, id, `거래처 삭제: ${client.name}` );
        });

        return true;
    }

    //* 복구 - 같은 사업자번호의 거래처가 이미 다시 등록돼 있으면 400
    async restore( user: Actor, id: number ) {
        const client = await this.prisma.projectClient.findFirst({ where: { id, deleted: true } });
        if ( !client ) {
            throw new NotFoundException( '삭제된 거래처가 아닙니다.' );
        }
        if ( client.businessNo ) {
            await this.assertBusinessNoAvailable( client.businessNo, id );
        }

        return this.withDuplicateGuard( () => this.prisma.$transaction( async ( tx ) => {
            const restored = await tx.projectClient.update({
                where: { id, deleted: true },
                data: { deleted: false, deletedAt: null, deletedId: null, updatedId: user.id },
            });
            await this.audit.log( { targetId: id, actionType: AuditActionType.RESTORE, content: `거래처 복구: ${restored.name}` }, tx );
            return restored;
        }) );
    }

    //! 담당자

    async createContact( user: Actor, clientId: number, body: CreateProjectClientContactDto ) {
        const client = await this.findActive( clientId );

        return this.prisma.$transaction( async ( tx ) => {
            const contact = await tx.projectClientContact.create({
                data: { ...body, clientId, createdId: user.id, updatedId: user.id },
                select: contactSelect,
            });
            await this.contactAudit.created( tx, contact.id, `거래처 담당자 등록: ${client.name} - ${contact.name}`, { clientId } );
            return contact;
        });
    }

    async updateContact( user: Actor, clientId: number, contactId: number, body: UpdateProjectClientContactDto ) {
        const before = await this.findContact( clientId, contactId );

        return this.prisma.$transaction( async ( tx ) => {
            const contact = await tx.projectClientContact.update({
                where: { id: contactId, deleted: false },
                data: { ...body, updatedId: user.id },
                select: contactSelect,
            });
            await this.contactAudit.updated( tx, contactId, `거래처 담당자 수정: ${contact.name}`, diffChanges( before, { ...body } ), { clientId } );
            return contact;
        });
    }

    async deleteContact( user: Actor, clientId: number, contactId: number ) {
        const contact = await this.findContact( clientId, contactId );

        await this.prisma.$transaction( async ( tx ) => {
            await tx.projectClientContact.update({
                where: { id: contactId, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });
            await this.contactAudit.deleted( tx, contactId, `거래처 담당자 삭제: ${contact.name}`, { clientId } );
        });

        return true;
    }

    //! 내부

    //* 삭제되지 않은 거래처 (수정·삭제·담당자 관리, 프로젝트에 연결할 때)
    async findActive( id: number ) {
        const client = await this.prisma.projectClient.findFirst({ where: { id, deleted: false } });
        if ( !client ) {
            throw new NotFoundException( '존재하지 않는 거래처입니다.' );
        }
        return client;
    }

    private async findContact( clientId: number, contactId: number ) {
        await this.findActive( clientId );
        const contact = await this.prisma.projectClientContact.findFirst({ where: { id: contactId, clientId, deleted: false } });
        if ( !contact ) {
            throw new NotFoundException( '존재하지 않는 담당자입니다.' );
        }
        return contact;
    }

    private listWhere( search: string | undefined, deleted: boolean ): Prisma.ProjectClientWhereInput {
        const keyword = search?.trim();
        const digits = keyword?.replace( /[^0-9]/g, '' );
        return {
            deleted,
            ...( keyword && {
                OR: [
                    { name: { contains: keyword, mode: 'insensitive' } },
                    ...( digits ? [ { businessNo: { contains: digits } } ] : [] ),
                ],
            }),
        };
    }

    private async assertBusinessNoAvailable( businessNo: string, exceptId?: number ) {
        const exists = await this.prisma.projectClient.findFirst({
            where: { businessNo, deleted: false, id: exceptId ? { not: exceptId } : undefined },
            select: { name: true },
        });
        if ( exists ) {
            throw new BadRequestException( `${DUPLICATE_BUSINESS_NO} (${exists.name})` );
        }
    }

    // 서비스 검사를 동시에 통과한 요청은 DB 부분 unique에서 막히므로 500 대신 409로
    private async withDuplicateGuard<T>( fn: () => Promise<T> ): Promise<T> {
        try {
            return await fn();
        } catch ( e ) {
            if ( e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ) {
                throw new ConflictException( DUPLICATE_BUSINESS_NO );
            }
            throw e;
        }
    }

    private async userNames( ids: ( number | null )[] ) {
        const unique = [ ...new Set( ids.filter( ( id ): id is number => id !== null ) ) ];
        if ( unique.length === 0 ) return new Map<number, string>();
        const users = await this.prisma.users.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
        return new Map( users.map( ( u ) => [ u.id, u.name ] ) );
    }
}
