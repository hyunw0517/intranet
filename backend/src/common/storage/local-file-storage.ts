import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createReadStream } from "fs";
import { mkdir, stat, unlink, writeFile } from "fs/promises";
import { dirname, resolve, sep } from "path";
import { Readable } from "stream";
import { FileStorage } from "./file-storage";

//* 로컬 디스크 저장소 (개발, 단일 EC2)
// 저장 루트는 .env의 UPLOAD_ROOT (없으면 ../uploads). 업로드 파일은 데이터라 코드 폴더 밖에 둔다.
// 컨테이너에서 쓰면 UPLOAD_ROOT를 볼륨으로 마운트해야 재배포해도 파일이 남는다.
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
