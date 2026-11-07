import { Readable } from "stream";

//* 파일 저장소 (저장 위치를 모르는 쪽이 쓰는 계약)
// FilesService는 이 클래스만 알고, 실제 저장 위치(로컬 디스크 / S3)는 CommonModule의 provider가 정한다.
//   { provide: FileStorage, useClass: LocalFileStorage }  → S3로 바꾸면 S3FileStorage만 추가해 교체
// 추상 클래스로 둔 이유: TypeScript interface는 런타임에 사라져 Nest DI 토큰으로 쓸 수 없다.
//
// key = Files.path ("images/2026/11/<uuid>.png", "attachments/2026/11/<uuid>.pdf")
// 로컬에서는 업로드 루트 아래 상대 경로, S3에서는 객체 키로 그대로 쓴다.
export abstract class FileStorage {

    // 저장 (같은 key가 있으면 덮어쓴다 - key는 uuid라 겹치지 않음)
    abstract save( key: string, body: Buffer, mimeType: string ): Promise<void>;

    // 읽기 스트림 (없으면 null → 호출한 쪽이 404)
    abstract openStream( key: string ): Promise<Readable | null>;

    // 삭제 (없어도 오류 없음)
    abstract remove( key: string ): Promise<void>;
}
