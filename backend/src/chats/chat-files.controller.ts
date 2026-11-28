import { Controller, Get, Param, ParseIntPipe, Post, Query, Res, StreamableFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { MAX_ATTACHMENTS_PER_TARGET } from 'src/common/const/file.const';
import { ATTACHMENT_IMAGES_UPLOAD_OPTIONS, ATTACHMENT_NON_IMAGE_UPLOAD_OPTIONS } from 'src/common/util/upload-options.util';
import { UserRole } from 'src/generated/prisma/client';
import { ChatMessagesService } from './chat-messages.service';
import { ApiBadRequestResponse, ApiBody, ApiConsumes, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiPayloadTooLargeResponse, ApiProduces, ApiTags } from '@nestjs/swagger';

//* 채팅 파일 - 보내기·다운로드·썸네일 모두 채팅 권한을 확인한다 (공개 주소 없음)
@ApiTags('Chats · Files (채팅 파일)')
@Controller('chats/:roomId')
export class ChatFilesController {

    constructor(
        private readonly chatMessagesService: ChatMessagesService,
    ){}

    // 요청 1개 = 메시지 1개. multer 한도는 경로마다 하나라 이미지(장당 20MB)와 파일(200MB) 경로를 나눴다.

    //* 이미지 보내기 (1~10장 = 묶음 메시지 1개, 필드명 files)
    @Post('images')
    @Roles(UserRole.USER)
    @UseInterceptors( FilesInterceptor( 'files', MAX_ATTACHMENTS_PER_TARGET, ATTACHMENT_IMAGES_UPLOAD_OPTIONS ) )
    @ApiOperation({ summary: '이미지 보내기', description: 'multipart/form-data, 필드명 files, 1~10장 = 묶음 메시지 1개. png·jpg·gif·webp, 장당 20MB(요청 최대 200MB). 업로드와 메시지 생성을 한 번에 한다. 실제 이미지(시그니처 확인)면 미리보기 썸네일을 만든다. 공개 주소가 없고 채팅 권한을 확인하는 API로만 받는다.' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', required: [ 'files' ], properties: { files: { type: 'array', items: { type: 'string', format: 'binary' }, maxItems: 10 } } } }) // multipart 예외
    @ApiBadRequestResponse({ description: '파일 없음(필드명 files), 이미지가 아닌 확장자' })
    @ApiForbiddenResponse({ description: '1:1 상대가 채팅을 사용할 수 없음(읽기 전용)' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음' })
    @ApiPayloadTooLargeResponse({ description: '장당 20MB 초과 또는 10장 초과' })
    sendImages(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @UploadedFiles() files: Express.Multer.File[] | undefined,
    ) {
        return this.chatMessagesService.sendFiles( userId, roomId, files );
    }

    //* 파일 보내기 (동영상·문서 등 1개, 필드명 files, 이미지 확장자는 400)
    @Post('files')
    @Roles(UserRole.USER)
    @UseInterceptors( FilesInterceptor( 'files', 1, ATTACHMENT_NON_IMAGE_UPLOAD_OPTIONS ) )
    @ApiOperation({ summary: '파일 보내기', description: 'multipart/form-data, 필드명 files, 1개 = 메시지 1개. 동영상·문서 등 200MB. 이미지 확장자는 이미지 보내기로 보내야 한다(400). 이미지와 경로를 나눈 이유: multer 용량 한도는 경로마다 하나라서 장당 20MB와 200MB를 한 경로에서 다르게 걸 수 없다.' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', required: [ 'files' ], properties: { files: { type: 'string', format: 'binary' } } } }) // multipart 예외
    @ApiBadRequestResponse({ description: '파일 없음(필드명 files), 보낼 수 없는 형식(이미지 포함), 여러 개' })
    @ApiForbiddenResponse({ description: '1:1 상대가 채팅을 사용할 수 없음(읽기 전용)' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음' })
    @ApiPayloadTooLargeResponse({ description: '200MB 초과' })
    sendFile(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @UploadedFiles() files: Express.Multer.File[] | undefined,
    ) {
        return this.chatMessagesService.sendFiles( userId, roomId, files );
    }

    //* 파일 보관함 (최신순 커서, 참여 이후·삭제되지 않은 파일만)
    @Get('files')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '파일 보관함', description: '최신순 커서 페이지(cursor = 마지막으로 받은 파일 id). 대화와 같은 범위(참여 이후, 메시지·파일 삭제 안 됨).' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음' })
    listFiles(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Query() query: CursorPaginationDto,
    ) {
        return this.chatMessagesService.listFiles( userId, roomId, query );
    }

    //* 다운로드 (어떤 형식이든 열지 않고 내려받게)
    @Get('files/:fileId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '채팅 파일 다운로드', description: '권한 = 활성 참여자 + 참여 시점 이후 메시지 + 메시지·파일 삭제 안 됨. 어떤 형식이든 내려받게 한다(application/octet-stream + attachment). 공유 캐시에 남기지 않는다(private, no-store).' })
    @ApiProduces('application/octet-stream')
    @ApiOkResponse({ description: '파일 본문', schema: { type: 'string', format: 'binary' } })
    @ApiNotFoundResponse({ description: '파일을 찾을 수 없음(나간 사람, 재참여 전 파일, 삭제된 메시지·파일 포함)' })
    async download(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const { stream, originalName, size } = await this.chatMessagesService.openFile( userId, roomId, fileId );

        res.setHeader( 'X-Content-Type-Options', 'nosniff' );
        res.setHeader( 'Cache-Control', 'private, no-store' );

        return new StreamableFile( stream, {
            type: 'application/octet-stream',
            length: size,
            disposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent( originalName )}`,
        });
    }

    //* 이미지 미리보기 (썸네일 webp, 없으면 404)
    @Get('files/:fileId/thumbnail')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '채팅 이미지 미리보기', description: '480px webp 썸네일. 권한은 다운로드와 같다. 썸네일이 없으면(가짜·깨진 이미지) 404 → 화면은 엑스박스. 브라우저 캐시만 1시간(private).' })
    @ApiProduces('image/webp')
    @ApiOkResponse({ description: '썸네일 이미지', schema: { type: 'string', format: 'binary' } })
    @ApiNotFoundResponse({ description: '파일·썸네일을 찾을 수 없음' })
    async thumbnail(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const { stream, mimeType } = await this.chatMessagesService.openThumbnail( userId, roomId, fileId );

        res.setHeader( 'X-Content-Type-Options', 'nosniff' );
        // 권한이 필요한 이미지라 공유 캐시에는 남기지 않고 브라우저 캐시만 짧게 둔다
        res.setHeader( 'Cache-Control', 'private, max-age=3600' );

        return new StreamableFile( stream, { type: mimeType } );
    }
}
