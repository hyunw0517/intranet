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

//* 채팅 파일 (features.md 8.4) - 보내기·다운로드·썸네일 모두 채팅 권한을 확인한다 (공개 주소 없음)
// 경로: POST images · POST files · GET files(보관함) · GET files/:fileId · GET files/:fileId/thumbnail
@Controller('chats/:roomId')
export class ChatFilesController {

    constructor(
        private readonly chatMessagesService: ChatMessagesService,
    ){}

    // 보내기 → 만든 메시지 (요청 1개 = 메시지 1개). 용량 한도는 multer에서 건다 - 받은 뒤 검사하면 이미 메모리에 올라온 뒤라서.
    // 경로를 둘로 나눈 이유: multer 한도는 경로마다 하나라, 이미지(장당 20MB)와 그 밖의 파일(200MB)을 한 경로에서 다르게 걸 수 없다.

    //* 이미지 보내기 (1~10장 = 묶음 메시지 1개) - multipart 필드명 files, 장당 20MB → 요청 최대 200MB
    @Post('images')
    @Roles(UserRole.USER)
    @UseInterceptors( FilesInterceptor( 'files', MAX_ATTACHMENTS_PER_TARGET, ATTACHMENT_IMAGES_UPLOAD_OPTIONS ) )
    sendImages(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @UploadedFiles() files: Express.Multer.File[] | undefined,
    ) {
        return this.chatMessagesService.sendFiles( userId, roomId, files );
    }

    //* 파일 보내기 (동영상·문서 등 1개 = 메시지 1개) - multipart 필드명 files, 200MB, 이미지 확장자는 400
    @Post('files')
    @Roles(UserRole.USER)
    @UseInterceptors( FilesInterceptor( 'files', 1, ATTACHMENT_NON_IMAGE_UPLOAD_OPTIONS ) )
    sendFile(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @UploadedFiles() files: Express.Multer.File[] | undefined,
    ) {
        return this.chatMessagesService.sendFiles( userId, roomId, files );
    }

    //* 파일 보관함 (최신순, ?cursor=마지막으로 받은 파일 id&take=) - 참여 시점 이후·삭제되지 않은 파일만
    @Get('files')
    @Roles(UserRole.USER)
    listFiles(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Query() query: CursorPaginationDto,
    ) {
        return this.chatMessagesService.listFiles( userId, roomId, query );
    }

    //* 다운로드 - 어떤 형식이든 브라우저가 열지 않고 내려받게 한다 (게시판 첨부와 같은 헤더)
    @Get('files/:fileId')
    @Roles(UserRole.USER)
    async download(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { stream, originalName, size } = await this.chatMessagesService.openFile( userId, roomId, fileId );

        res.setHeader( 'X-Content-Type-Options', 'nosniff' );
        res.setHeader( 'Cache-Control', 'private, no-store' );

        return new StreamableFile( stream, {
            type: 'application/octet-stream',
            length: size,
            disposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent( originalName )}`,
        });
    }

    //* 이미지 미리보기 (썸네일 webp) - 없으면 404 → 화면이 엑스박스
    @Get('files/:fileId/thumbnail')
    @Roles(UserRole.USER)
    async thumbnail(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { stream, mimeType } = await this.chatMessagesService.openThumbnail( userId, roomId, fileId );

        res.setHeader( 'X-Content-Type-Options', 'nosniff' );
        // 권한이 필요한 이미지라 공유 캐시(프록시)에 남기지 않는다. 같은 파일 내용은 바뀌지 않으므로 브라우저 캐시만 짧게
        res.setHeader( 'Cache-Control', 'private, max-age=3600' );

        return new StreamableFile( stream, { type: mimeType } );
    }
}
