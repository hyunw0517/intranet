import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { extname } from "path";
import { FileTargetType, Prisma } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { FileKind, IMAGE_MIME_BY_EXT, MAX_ATTACHMENTS_PER_TARGET, PUBLIC_IMAGE_URL_PREFIX, PUBLIC_THUMBNAIL_URL_PREFIX, STORED_IMAGE_NAME_REGEX } from "./const/file.const";
import { FileStorage } from "./storage/file-storage";
import { kstYearMonthPath } from "./util/date.util";
import { detectImageMime } from "./util/image-signature.util";
import { createThumbnail, thumbnailKey } from "./util/thumbnail.util";

// 파일 조회 select (저장 경로·저장 파일명은 내부에서만 쓰고 응답 FileInfo에는 넣지 않는다)
const FILE_INFO_SELECT = {
    id: true,
    originalName: true,
    storedName: true,
    size: true,
    mimeType: true,
    path: true,
} satisfies Prisma.FilesSelect;

type FileRow = Prisma.FilesGetPayload<{ select: typeof FILE_INFO_SELECT }>;

export interface FileInfo {
    id: number;
    originalName: string;
    size: number;
    mimeType: string;
    url: string | null;             // 본문 이미지만 공개 주소, 첨부는 null (업무 모듈의 다운로드 API로 받는다)
    thumbnailUrl: string | null;    // 본문 이미지 썸네일 공개 주소, 첨부는 null
}

//* 파일 저장·조회·연결 (공용)
// - 업무 권한은 모른다. (common은 업무 모듈을 import하지 않는다)
//   첨부 다운로드는 각 업무 모듈이 권한을 확인한 뒤 openTargetFile로 스트림을 받아 응답한다.
// - 실제 저장 위치는 모른다. (FileStorage: 로컬 디스크 → 운영에서 S3로 교체, CommonModule provider)
//   DB의 Files.path가 저장소 key다.
@Injectable()
export class FilesService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: FileStorage,
    ){}

    //* 업로드 저장 + 기록
    // 대상(targetType/targetId)은 비워 두고, 글 저장 시 syncTargetFiles로 연결한다.
    async saveUploaded(
        file: Express.Multer.File | undefined,
        kind: FileKind,
        userId: number,
    ): Promise<FileInfo> {
        if ( !file ) {
            throw new BadRequestException('업로드할 파일이 없습니다. (form-data 필드명: file)');
        }

        const ext = extname( file.originalname ).toLowerCase();
        let mimeType = file.mimetype || 'application/octet-stream';
        let thumbnail: Buffer | null = null;

        if ( kind === FileKind.IMAGE ) {
            // 실제 형식이 확장자와 같은 이미지인지 확인 (.png로 이름만 바꾼 html 등 차단)
            const detected = detectImageMime( file.buffer );
            if ( !detected || detected !== IMAGE_MIME_BY_EXT[ ext ] ) {
                throw new BadRequestException('이미지 파일이 아니거나 확장자와 실제 형식이 다릅니다.');
            }
            mimeType = detected;

            // 썸네일 (게시판 타입과 무관하게 항상). 시그니처는 맞지만 내용이 깨진 이미지는 여기서 걸러진다.
            try {
                thumbnail = await createThumbnail( file.buffer );
            } catch {
                throw new BadRequestException('이미지를 읽을 수 없습니다. 손상된 파일인지 확인해 주세요.');
            }
        }

        // 저장 파일명은 서버가 만든다. (원본 파일명은 DB에만, .jpeg는 .jpg로 통일)
        // 저장 위치: <종류>/<KST 연>/<월>/<uuid> - 오류 시 기간으로 대상 파일을 찾기 쉽고, 월별 용량 확인과 폴더당 파일 수 제한(로컬 디스크)을 위해.
        // 연·월은 업로드 시점에 한 번 정해 path에 저장한다. (이후 createdAt으로 다시 계산하지 않는다)
        const storedName = `${randomUUID()}${ext === '.jpeg' ? '.jpg' : ext}`;
        const key = `${kind}/${kstYearMonthPath( new Date() )}/${storedName}`;
        const thumbKey = thumbnail ? thumbnailKey( key ) : null;

        // 저장소에 먼저 쓰고 DB에 기록한다. DB 기록이 실패하면 저장한 파일을 지운다.
        // (반대 순서면 DB에는 있는데 파일이 없는 행이 생겨 다운로드가 404가 된다)
        await this.storage.save( key, file.buffer, mimeType );
        if ( thumbnail && thumbKey ) {
            try {
                await this.storage.save( thumbKey, thumbnail, 'image/webp' );
            } catch ( e ) {
                await this.storage.remove( key );
                throw e;
            }
        }

        try {
            const row = await this.prisma.files.create({
                select: FILE_INFO_SELECT,
                data: {
                    originalName: file.originalname,
                    storedName,
                    path: key,
                    size: file.size,
                    mimeType,
                    createdId: userId,
                    updatedId: userId,
                },
            });

            return this.toFileInfo( row );
        } catch ( e ) {
            await this.storage.remove( key );
            if ( thumbKey ) await this.storage.remove( thumbKey );
            throw e;
        }
    }

    //* 본문 이미지 공개 조회 (로그인 없이, uuid 파일명으로만)
    async openPublicImage( storedName: string ) {
        return this.openStream( await this.findPublicImageRow( storedName ) );
    }

    //* 본문 이미지 썸네일 공개 조회 (원본 저장 파일명으로 찾는다)
    // 원본이 삭제되면 썸네일도 404. 썸네일이 없으면(썸네일 기능 이전 업로드 등) 원본을 대신 준다.
    async openPublicThumbnail( storedName: string ) {
        const row = await this.findPublicImageRow( storedName );

        const stream = await this.storage.openStream( thumbnailKey( row.path ) );
        if ( stream ) {
            return { stream, mimeType: 'image/webp', size: null };
        }

        return this.openStream( row );
    }

    //* 공개 이미지 행 조회 (삭제되지 않은 본문 이미지만)
    private async findPublicImageRow( storedName: string ) {
        // 패턴 검사로 경로 문자(../ 등)가 섞인 값은 DB 조회 전에 거른다.
        if ( !STORED_IMAGE_NAME_REGEX.test( storedName ) ) {
            throw new NotFoundException('이미지를 찾을 수 없습니다.');
        }

        const row = await this.prisma.files.findFirst({
            select: FILE_INFO_SELECT,
            where: {
                storedName,
                path: { startsWith: `${FileKind.IMAGE}/` },
                deleted: false,
            },
        });

        if ( !row ) {
            throw new NotFoundException('이미지를 찾을 수 없습니다.');
        }

        return row;
    }

    //* 대상별 첫 번째 파일 (order = 0) → targetId별 FileInfo
    // 게시글 목록의 대표 이미지(앨범 그리드)에 쓴다. 목록 한 페이지당 쿼리 1번.
    // 대표 이미지 컬럼을 따로 두지 않고, 본문 순서대로 저장한 이미지 순서(order)를 그대로 쓴다.
    async findFirstByTargets(
        targetType: FileTargetType,
        targetIds: number[],
    ): Promise<Map<number, FileInfo>> {
        if ( targetIds.length === 0 ) {
            return new Map();
        }

        const rows = await this.prisma.files.findMany({
            select: { ...FILE_INFO_SELECT, targetId: true },
            where: { targetType, targetId: { in: targetIds }, order: 0, deleted: false },
        });

        return new Map( rows.map( row => [ row.targetId!, this.toFileInfo( row ) ] ) );
    }

    //* 대상별 파일 개수 → targetId별 개수 (파일이 없는 대상은 Map에 없음)
    // 앨범 그리드의 "+추가 이미지 수" 표시에 쓴다. 목록 한 페이지당 쿼리 1번 (GROUP BY target_id).
    async countByTargets(
        targetType: FileTargetType,
        targetIds: number[],
    ): Promise<Map<number, number>> {
        if ( targetIds.length === 0 ) {
            return new Map();
        }

        const rows = await this.prisma.files.groupBy({
            by: [ 'targetId' ],
            where: { targetType, targetId: { in: targetIds }, deleted: false },
            _count: { _all: true },
        });

        return new Map( rows.map( row => [ row.targetId!, row._count._all ] ) );
    }

    //* 대상에 연결된 파일 하나 열기 (첨부 다운로드)
    // 호출 전에 업무 모듈이 대상(게시글 등) 접근 권한을 확인해야 한다.
    async openTargetFile(
        fileId: number,
        targetType: FileTargetType,
        targetId: number,
    ) {
        const row = await this.prisma.files.findFirst({
            select: FILE_INFO_SELECT,
            where: {
                id: fileId,
                targetType,
                targetId,
                deleted: false,
            },
        });

        if ( !row ) {
            throw new NotFoundException('파일을 찾을 수 없습니다.');
        }

        return this.openStream( row );
    }

    //* 대상에 연결된 파일 목록 (정렬 순서대로)
    async listByTarget(
        targetType: FileTargetType,
        targetId: number,
    ): Promise<FileInfo[]> {
        const rows = await this.prisma.files.findMany({
            select: FILE_INFO_SELECT,
            where: { targetType, targetId, deleted: false },
            orderBy: [ { order: 'asc' }, { id: 'asc' } ],
        });

        return rows.map( row => this.toFileInfo( row ) );
    }

    //* 본문 이미지 중 이 대상에 쓸 수 있는 것 → storedName별 id
    // 쓸 수 있는 이미지: 내가 올리고 아직 연결되지 않은 이미지 + 이미 이 대상에 연결된 이미지(수정 시 유지)
    // 다른 글의 이미지 주소를 붙여 넣은 경우 등은 포함되지 않는다. (호출한 쪽이 본문에서 제거)
    async findUsableImages(
        storedNames: string[],
        userId: number,
        targetType: FileTargetType,
        targetId: number | null,
    ): Promise<Map<string, number>> {
        if ( storedNames.length === 0 ) {
            return new Map();
        }

        const rows = await this.prisma.files.findMany({
            select: { id: true, storedName: true },
            where: {
                storedName: { in: storedNames },
                path: { startsWith: `${FileKind.IMAGE}/` },
                deleted: false,
                OR: [
                    { targetType: null, targetId: null, createdId: userId },
                    ...( targetId !== null ? [ { targetType, targetId } ] : [] ),
                ],
            },
        });

        return new Map( rows.map( row => [ row.storedName, row.id ] ) );
    }

    //* 대상의 파일 목록을 fileIds로 맞춘다. (작성·수정 공용, 호출한 쪽의 트랜잭션 안에서)
    // fileIds = 최종 목록 (순서 = 표시 순서)
    // - 이미 연결된 파일: 유지 (순서만 갱신)
    // - 새 파일: 내가 올린 미연결 파일만 연결
    // - 목록에서 빠진 기존 파일: soft delete
    async syncTargetFiles(
        tx: Prisma.TransactionClient,
        params: {
            kind: FileKind;
            targetType: FileTargetType;
            targetId: number;
            fileIds: number[];
            userId: number;
        },
    ) {
        const { kind, targetType, targetId, userId } = params;
        const fileIds = [ ...new Set( params.fileIds ) ];

        if ( kind === FileKind.ATTACHMENT && fileIds.length > MAX_ATTACHMENTS_PER_TARGET ) {
            throw new BadRequestException(`첨부파일은 최대 ${MAX_ATTACHMENTS_PER_TARGET}개까지 등록할 수 있습니다.`);
        }

        const existing = await tx.files.findMany({
            select: { id: true },
            where: { targetType, targetId, deleted: false },
        });
        const existingIds = new Set( existing.map( row => row.id ) );

        // 빠진 파일 삭제
        const removeIds = [ ...existingIds ].filter( id => !fileIds.includes( id ) );
        if ( removeIds.length > 0 ) {
            await tx.files.updateMany({
                where: { id: { in: removeIds } },
                data: { deleted: true, deletedAt: new Date(), deletedId: userId, updatedId: userId },
            });
        }

        // 새 파일 연결
        // 검증 조건(내가 올림, 미연결, 같은 종류)을 WHERE에 걸고, 바뀐 행 수가 다르면 전체 롤백한다.
        // (다른 사람 파일 id·이미 다른 글에 연결된 파일·첨부를 이미지로 쓰는 요청 등을 막는다)
        const linkIds = fileIds.filter( id => !existingIds.has( id ) );
        if ( linkIds.length > 0 ) {
            const { count } = await tx.files.updateMany({
                where: {
                    id: { in: linkIds },
                    createdId: userId,
                    targetType: null,
                    targetId: null,
                    path: { startsWith: `${kind}/` },
                    deleted: false,
                },
                data: { targetType, targetId, updatedId: userId },
            });

            if ( count !== linkIds.length ) {
                throw new BadRequestException('사용할 수 없는 파일이 포함되어 있습니다. 파일을 다시 업로드해 주세요.');
            }
        }

        // 표시 순서
        for ( const [ order, id ] of fileIds.entries() ) {
            await tx.files.update({ where: { id }, data: { order } });
        }
    }

    //* 대상 삭제 시 연결된 파일 soft delete
    async softDeleteByTarget(
        tx: Prisma.TransactionClient,
        targetTypes: FileTargetType[],
        targetId: number,
        userId: number,
    ) {
        await tx.files.updateMany({
            where: { targetType: { in: targetTypes }, targetId, deleted: false },
            data: { deleted: true, deletedAt: new Date(), deletedId: userId, updatedId: userId },
        });
    }

    private toFileInfo( row: FileRow ): FileInfo {
        const isImage = row.path.startsWith(`${FileKind.IMAGE}/`);
        return {
            id: row.id,
            originalName: row.originalName,
            size: row.size,
            mimeType: row.mimeType,
            url: isImage ? `${PUBLIC_IMAGE_URL_PREFIX}${row.storedName}` : null,
            thumbnailUrl: isImage ? `${PUBLIC_THUMBNAIL_URL_PREFIX}${row.storedName}` : null,
        };
    }

    //* DB 행 → 저장소 스트림 (저장소에 파일이 없으면 404)
    private async openStream( row: FileRow ) {
        const stream = await this.storage.openStream( row.path );

        if ( !stream ) {
            throw new NotFoundException('파일을 찾을 수 없습니다.');
        }

        return {
            stream,
            originalName: row.originalName,
            mimeType: row.mimeType,
            size: row.size,
        };
    }
}
