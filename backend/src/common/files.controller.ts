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
import { ApiBadRequestResponse, ApiBody, ApiConsumes, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiPayloadTooLargeResponse, ApiProduces, ApiTags } from '@nestjs/swagger';

//* 파일 업로드 (먼저 업로드 → 글 저장 시 id로 연결) + 본문 이미지 공개 조회
// 첨부 다운로드는 여기 두지 않는다. 대상별 권한 확인이 필요하므로 업무 모듈 컨트롤러가 담당한다.
// (예: GET /boards/:boardId/posts/:postId/files/:fileId)
@ApiTags('Files (파일)')
@Controller('common/files')
export class FilesController {

    constructor(
        private readonly filesService: FilesService,
    ){}

    //* 본문 이미지 업로드 (form-data 필드명: file)
    @Post('images')
    @Roles(UserRole.USER)
    @UseInterceptors(FileInterceptor('file', IMAGE_UPLOAD_OPTIONS))
    @ApiOperation({ summary: '본문 이미지 업로드', description: 'multipart/form-data, 필드명 file, 한 번에 1개. png·jpg·gif·webp, 20MB까지(svg는 스크립트를 담을 수 있어 제외). 확장자를 먼저 보고 저장 후 파일 시그니처로 실제 형식을 다시 확인한다. 썸네일도 만든다. 업로드만으로는 어디에도 연결되지 않고, 게시글·프로필 저장 시 연결된다. 응답의 url은 로그인 없이 열리는 공개 uuid 주소다.' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', required: [ 'file' ], properties: { file: { type: 'string', format: 'binary' } } } }) // multipart는 DTO로 표현되지 않아 직접 적는다 (docs/api.md 3.3 예외)
    @ApiBadRequestResponse({ description: '파일 없음(필드명 file), 허용하지 않는 확장자, 이미지가 아니거나 확장자와 실제 형식이 다름, 손상된 이미지' })
    @ApiPayloadTooLargeResponse({ description: '20MB 초과' })
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
    @ApiOperation({ summary: '첨부파일 업로드', description: 'multipart/form-data, 필드명 file, 한 번에 1개. 200MB까지. 허용 확장자: 문서(pdf·txt·csv·zip·doc(x)·xls(x)·ppt(x)·hwp(x)), 이미지, 동영상(mp4·mov·avi·mkv·webm·wmv). 실행 파일·html·svg는 제외. 비공개라 공개 주소가 없고, 연결된 대상의 다운로드 API(예: GET /boards/:boardId/posts/:postId/files/:fileId)가 권한을 확인한 뒤 내려준다.' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', required: [ 'file' ], properties: { file: { type: 'string', format: 'binary' } } } }) // multipart 예외
    @ApiBadRequestResponse({ description: '파일 없음(필드명 file), 허용하지 않는 확장자' })
    @ApiPayloadTooLargeResponse({ description: '200MB 초과' })
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
    @ApiOperation({ summary: '본문 이미지 (공개)', description: '<img src>는 Authorization 헤더를 보낼 수 없어 로그인 없이 연다. 추측할 수 없는 uuid 파일명이 사실상의 키다. 하루 캐시(Cache-Control), nosniff.' })
    @ApiProduces('image/png', 'image/jpeg', 'image/gif', 'image/webp')
    @ApiOkResponse({ description: '이미지 본문', schema: { type: 'string', format: 'binary' } })
    @ApiNotFoundResponse({ description: '이미지 없음(삭제됨, 형식이 맞지 않는 파일명 포함)' })
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
    @ApiOperation({ summary: '본문 이미지 썸네일 (공개)', description: '원본 저장 파일명으로 찾는다. 원본이 삭제되면 404, 썸네일이 없으면(썸네일 기능 이전 업로드 등) 원본을 대신 준다. 캐시 정책은 원본과 같다.' })
    @ApiProduces('image/webp', 'image/png', 'image/jpeg', 'image/gif')
    @ApiOkResponse({ description: '이미지 본문', schema: { type: 'string', format: 'binary' } })
    @ApiNotFoundResponse({ description: '이미지 없음' })
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
