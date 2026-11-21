import { INestApplication, Logger, Type } from '@nestjs/common';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ADMIN_PERMISSION_KEY } from 'src/auth/decorator/require-admin.decorator';
import { ROLES_KEY } from 'src/auth/decorator/roles.decorator';
import { IS_PUBLIC_KEY } from 'src/common/decorator/is-public.decorator';
import { AdminPermission, UserRole } from 'src/generated/prisma/client';

//! API 문서 (Swagger, docs/api.md)
// - 경로: NestJS에는 global prefix가 없고, 브라우저는 /api/* 로 호출한다(Next.js rewrite·운영 Nginx가 /api를 떼고 전달).
//   그래서 NestJS 쪽은 docs, 브라우저에서는 /api/docs 로 연다. (NestJS에 api로 두면 브라우저 주소가 /api/api가 된다)
// - 서버 주소 /api: "Try it out" 요청이 rewrite를 거치게 한다. 그래야 refresh 쿠키(Path=/api/auth)도 그대로 동작한다.
// - 문서는 AppModule에 등록된 모듈만 읽으므로, 꺼진 애드온(ADDONS)은 문서에도 나오지 않는다.
// - 운영에서는 Nginx Basic 인증으로 /api/docs, /api/docs-json 을 막는다. (사이트 회원 계정과 별개)
// - main.ts에서만 호출한다. e2e가 쓰는 configureApp(app.setup.ts)에는 넣지 않는다. (테스트에는 문서가 필요 없다)
export const SWAGGER_PATH = 'docs';

const BEARER = 'bearer';
const BASIC = 'basic';

export function setupSwagger( app: INestApplication ) {
    const config = new DocumentBuilder()
        .setTitle( 'Intranet API' )
        .setDescription( '사내 인트라넷 백엔드 API. 공통 규약(인증 흐름, 에러 형식, 페이지네이션)은 저장소의 docs/api.md 5장을 본다.' )
        .setVersion( '1.0' )
        .addServer( '/api' )
        // 로그인(POST /auth/login/emp)만 Basic(사번:비밀번호), 나머지는 access token
        .addBasicAuth( undefined, BASIC )
        .addBearerAuth( undefined, BEARER )
        // 문서 전역에 Bearer를 건다. 코드의 가드 구조(전역 AccessTokenGuard + @IsPublic 예외)와 같게 해서 새 컨트롤러에서 빠지지 않게 한다.
        .addSecurityRequirements( BEARER )
        .build();

    const document = SwaggerModule.createDocument( app, config );
    applyAccessRules( app, document );

    // JSON 스펙은 기본 주소 docs-json (브라우저에서는 /api/docs-json)
    SwaggerModule.setup( SWAGGER_PATH, app, document, {
        customSiteTitle: 'Intranet API',
        swaggerOptions: {
            persistAuthorization: true, // 새로고침해도 입력한 토큰 유지 (개발 편의)
        },
    } );
}

//* 라우트별 접근 조건을 문서에 반영한다 (공개 여부, 권한, 401/403)
// - 권한 데코레이터(@IsPublic, @Roles, @RequireAdmin)는 고치지 않고, 가드와 같은 규칙(getAllAndOverride: 메서드 → 클래스)으로 값을 읽는다.
//   그래서 문서의 권한 표시와 실제 검사가 어긋나지 않고, 인증 코드는 Swagger를 모른다.
// - 문서의 라우트와 메서드는 operationId(기본값 "컨트롤러클래스_메서드")로 짝짓는다. 컨트롤러 클래스 이름이 겹치면 안 된다.
function applyAccessRules( app: INestApplication, document: OpenAPIObject ) {
    const reflector = app.get( Reflector );
    const handlers = collectHandlers( app );
    const logger = new Logger( 'Swagger' );

    for ( const [ path, pathItem ] of Object.entries( document.paths ) ) {
        for ( const [ method, operation ] of Object.entries( pathItem ) as [ string, OperationLike ][] ) {
            if ( !operation?.operationId ) continue;

            const target = handlers.get( operation.operationId );
            if ( !target ) {
                logger.warn( `권한 표시를 못 붙였습니다: ${method.toUpperCase()} ${path} (${operation.operationId})` );
                continue;
            }

            const targets = [ target.handler, target.controller ];
            // 가드(AccessTokenGuard, RolesGuard)와 같은 읽기 방식. 데코레이터가 없으면 undefined
            const isPublic = reflector.getAllAndOverride<boolean>( IS_PUBLIC_KEY, targets );
            const role = reflector.getAllAndOverride<UserRole>( ROLES_KEY, targets );
            const permission = reflector.getAllAndOverride<AdminPermission>( ADMIN_PERMISSION_KEY, targets );

            operation.responses ??= {};

            if ( isPublic ) {
                // 전역 Bearer 해제. 라우트에 직접 붙인 보안(@ApiBasicAuth 등)이 있으면 그대로 둔다.
                operation.security ??= [];
                prependDescription( operation, '**공개** (access token 불필요)' );
                continue;
            }

            operation.responses[ '401' ] ??= { description: '로그인 필요 (access token 없음·만료 → 재발급 후 다시 요청)' };

            if ( !role ) {
                prependDescription( operation, '**권한**: 로그인만 필요 (GUEST 포함, 본인 계정용)' );
                continue;
            }

            prependDescription( operation, `**권한**: ${describeRole( role, permission )}` );
            operation.responses[ '403' ] ??= { description: '권한 없음 (재발급해도 결과가 같다)' };
        }
    }
}

type Handler = ( ...args: unknown[] ) => unknown;

type OperationLike = {
    operationId?: string;
    description?: string;
    security?: Record<string, string[]>[];
    responses?: Record<string, unknown>;
};

//* operationId → 컨트롤러 메서드 (등록된 모듈의 컨트롤러만)
function collectHandlers( app: INestApplication ) {
    const handlers = new Map<string, { controller: Type; handler: Handler }>();

    for ( const module of app.get( ModulesContainer ).values() ) {
        for ( const wrapper of module.controllers.values() ) {
            const controller = wrapper.metatype as Type | null;
            if ( !controller ) continue;

            const prototype = controller.prototype as Record<string, unknown>;
            for ( const name of Object.getOwnPropertyNames( prototype ) ) {
                const handler = prototype[ name ];
                if ( name === 'constructor' || typeof handler !== 'function' ) continue;
                handlers.set( `${controller.name}_${name}`, { controller, handler: handler as Handler } );
            }
        }
    }

    return handlers;
}

function describeRole( role: UserRole, permission: AdminPermission | undefined ): string {
    if ( role === UserRole.ADMIN ) {
        return permission
            ? `ADMIN 이상 + 관리자 기능 \`${permission}\` (SUPER_ADMIN은 모든 기능)`
            : 'ADMIN 이상 (관리자 기능과 상관없음)';
    }
    if ( role === UserRole.SUPER_ADMIN ) return 'SUPER_ADMIN';
    return `${role} 이상`;
}

function prependDescription( operation: OperationLike, text: string ) {
    operation.description = operation.description ? `${text}\n\n${operation.description}` : text;
}
