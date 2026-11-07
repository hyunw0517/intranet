import { Controller, Get, Param, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { Roles } from "src/auth/decorator/roles.decorator";
import { User } from "src/auth/decorator/user.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { FileKind } from "./const/file.const";
import { IsPublic } from "./decorator/is-public.decorator";
import { FilesService } from "./files.service";
import { ATTACHMENT_UPLOAD_OPTIONS, IMAGE_UPLOAD_OPTIONS } from "./util/upload-options.util";

//* 파일 업로드 (먼저 업로드 → 글 저장 시 id로 연결) + 본문 이미지 공개 조회
// 첨부 다운로드는 여기 두지 않는다. 대상별 권한 확인이 필요하므로 업무 모듈 컨트롤러가 담당한다.
// (예: GET /boards/:boardId/posts/:postId/files/:fileId)
@Controller('common/files')
export class FilesController {

    constructor(
        private readonly filesService: FilesService,
    ){}

    //* 본문 이미지 업로드 (form-data 필드명: file)
    @Post('images')
    @Roles(UserRole.USER)
    @UseInterceptors(FileInterceptor('file', IMAGE_UPLOAD_OPTIONS))
    uploadImage(
        @User() user: Pick<Users, 'id'>,
        @UploadedFile() file: Express.Multer.File | undefined,
    ) {
        return this.filesService.saveUploaded( file, FileKind.IMAGE, user.id );
    }

    //* 첨부파일 업로드 (form-data 필드명: file)
    @Post('attachments')
    @Roles(UserRole.USER)
    @UseInterceptors(FileInterceptor('file', ATTACHMENT_UPLOAD_OPTIONS))
    uploadAttachment(
        @User() user: Pick<Users, 'id'>,
        @UploadedFile() file: Express.Multer.File | undefined,
    ) {
        return this.filesService.saveUploaded( file, FileKind.ATTACHMENT, user.id );
    }

    //* 본문 이미지 조회 (공개)
    // <img src>는 Authorization 헤더를 보낼 수 없으므로 로그인 없이 연다. 추측할 수 없는 uuid 파일명이 사실상의 키다.
    @Get('images/:storedName')
    @IsPublic()
    async getImage(
        @Param('storedName') storedName: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { stream, mimeType, size } = await this.filesService.openPublicImage( storedName );

        // 같은 주소의 내용은 바뀌지 않으므로 캐시한다. 삭제된 이미지가 캐시로 계속 보이는 기간을 줄이려고 하루로 둔다.
        res.setHeader( 'Cache-Control', 'public, max-age=86400' );
        // 브라우저가 내용을 보고 형식을 추측(MIME sniffing)하지 않게 한다.
        res.setHeader( 'X-Content-Type-Options', 'nosniff' );

        return new StreamableFile( stream, { type: mimeType, length: size } );
    }

    //* 본문 이미지 썸네일 조회 (공개, 원본 저장 파일명으로)
    // 목록 그리드(앨범)에서 쓴다. 원본과 같은 공개 규칙·캐시 정책.
    @Get('thumbnails/:storedName')
    @IsPublic()
    async getThumbnail(
        @Param('storedName') storedName: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { stream, mimeType, size } = await this.filesService.openPublicThumbnail( storedName );

        res.setHeader( 'Cache-Control', 'public, max-age=86400' );
        res.setHeader( 'X-Content-Type-Options', 'nosniff' );

        return new StreamableFile( stream, { type: mimeType, ...( size !== null ? { length: size } : {} ) } );
    }
}
