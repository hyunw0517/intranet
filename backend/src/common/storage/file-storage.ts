import { Readable } from "stream";

//* 파일 저장소 계약 (로컬 디스크 / S3는 CommonModule의 provider가 정한다)
// 추상 클래스로 둔 이유: interface는 런타임에 사라져 Nest DI 토큰으로 쓸 수 없다.
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
