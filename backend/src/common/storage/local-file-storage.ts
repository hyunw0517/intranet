import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createReadStream } from "fs";
import { mkdir, stat, unlink, writeFile } from "fs/promises";
import { dirname, resolve, sep } from "path";
import { Readable } from "stream";
import { FileStorage } from "./file-storage";

//* 로컬 디스크 저장소 (개발, 단일 EC2)
// 저장 루트는 .env의 UPLOAD_ROOT (상대 경로는 서버 실행 위치 = backend 기준, 없으면 ../uploads = intranet/uploads).
// 업로드 파일은 데이터라 코드 폴더(backend) 밖에 둔다. (infra-db의 DB 데이터 폴더와 같은 원칙, Docker 빌드 범위에도 들어가지 않음)
// 루트를 아는 곳은 이 클래스뿐이다. FilesService·DB는 key(images/2026/11/<uuid>.png)만 다룬다.
// 운영 컨테이너에서 로컬 저장을 쓴다면 UPLOAD_ROOT를 Docker 볼륨으로 마운트해야 재배포해도 파일이 남는다. (운영은 S3 예정)
@Injectable()
export class LocalFileStorage extends FileStorage {

    private readonly root: string;

    constructor( config: ConfigService ) {
        super();
        this.root = resolve( config.get<string>('UPLOAD_ROOT') || '../uploads' );
    }

    async save( key: string, body: Buffer ): Promise<void> {
        const fullPath = this.resolveKey( key );
        await mkdir( dirname( fullPath ), { recursive: true } );
        await writeFile( fullPath, body );
    }

    async openStream( key: string ): Promise<Readable | null> {
        const fullPath = this.resolveKey( key );
        try {
            await stat( fullPath );
        } catch {
            return null;
        }
        return createReadStream( fullPath );
    }

    async remove( key: string ): Promise<void> {
        try {
            await unlink( this.resolveKey( key ) );
        } catch {
            // 이미 없는 파일은 무시
        }
    }

    // key는 서버가 만든 값(DB의 path)만 들어오지만, 업로드 루트 밖을 가리키지 못하게 한 번 더 막는다.
    private resolveKey( key: string ): string {
        const fullPath = resolve( this.root, key );
        if ( !fullPath.startsWith( this.root + sep ) ) {
            throw new Error(`업로드 루트 밖의 경로입니다: ${key}`);
        }
        return fullPath;
    }
}
