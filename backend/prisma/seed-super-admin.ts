// 첫 슈퍼관리자 지정 (운영·개발 공용, 1회성)
// 실행: npx tsx prisma/seed-super-admin.ts <사번>        (DB 컨테이너가 떠 있어야 한다)
// 미리 보기: npx tsx prisma/seed-super-admin.ts <사번> --dry-run
//
// - 슈퍼관리자는 화면에서 슈퍼관리자만 지정할 수 있으므로, 처음 한 명은 이 스크립트로 만든다.
// - 대상: 삭제되지 않은 재직(ACTIVE) 회원이고 가입 승인(GUEST 아님)된 회원
// - 이미 슈퍼관리자가 있으면 아무것도 하지 않는다. (두 번째부터는 화면에서 지정)
// - SUPER_ADMIN은 모든 관리자 기능을 가진 것으로 보므로 adminPermissions는 비운다.
// - 바뀐 권한을 바로 쓰도록 tokenVersion을 올린다. (그 회원은 다시 로그인)
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuditActionType, AuditTargetType, PrismaClient, UserRole, UserStatus } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DRY_RUN = process.argv.includes('--dry-run');
const empNo = process.argv.slice(2).find( ( arg ) => !arg.startsWith('--') );

async function main(){
    if( !empNo ){
        throw new Error('사번을 넘겨 주세요. 예: npx tsx prisma/seed-super-admin.ts 2610002');
    }

    const existing = await prisma.users.findFirst({
        select: { name: true, empNo: true },
        where: { role: UserRole.SUPER_ADMIN, deleted: false },
    });

    if( existing ){
        console.log(`이미 슈퍼관리자가 있습니다: ${existing.name}(${existing.empNo}). 추가 지정은 관리자 화면에서 하세요.`);
        return;
    }

    const target = await prisma.users.findFirst({
        select: { id: true, name: true, empNo: true, role: true, status: true },
        where: { empNo, deleted: false },
    });

    if( !target ){
        throw new Error(`사번 ${empNo} 회원이 없습니다.`);
    }

    if( target.role === UserRole.GUEST || target.status !== UserStatus.ACTIVE ){
        throw new Error(`가입 승인된 재직 회원만 슈퍼관리자로 지정할 수 있습니다. (현재 ${target.role} / ${target.status})`);
    }

    console.log(`${target.name}(${target.empNo}): ${target.role} → SUPER_ADMIN${ DRY_RUN ? ' (dry-run, 저장 안 함)' : '' }`);

    if( DRY_RUN ){
        return;
    }

    await prisma.$transaction( async ( tx ) => {
        await tx.users.update({
            where: { id: target.id },
            data: {
                role: UserRole.SUPER_ADMIN,
                adminPermissions: [],
                tokenVersion: { increment: 1 },
            },
        });

        await tx.audit.create({
            data: {
                targetType: AuditTargetType.USER,
                targetId: target.id,
                actionType: AuditActionType.ROLE_CHANGE,
                content: `(스크립트) 첫 슈퍼관리자 지정: ${target.name}(${target.empNo})`,
                detail: { changes: { role: { before: target.role, after: UserRole.SUPER_ADMIN } } },
                createdId: null, // 스크립트 실행 (로그인한 작업자 없음)
            },
        });
    });

    console.log('완료. 해당 회원은 다시 로그인해야 합니다.');
}

main()
    .catch( ( e ) => {
        console.error( e instanceof Error ? e.message : e );
        process.exitCode = 1;
    })
    .finally( () => prisma.$disconnect() );
