import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadTestEnv } from './load-test-env';

//* e2e 실행 전 한 번: 테스트 DB에 마이그레이션 적용
// - migrate deploy는 적용되지 않은 마이그레이션만 실행한다. (데이터를 지우지 않음, 이미 최신이면 아무 일도 안 함)
// - 데이터 초기화는 각 테스트 파일이 resetDatabase()로 한다.
export default function globalSetup() {
    loadTestEnv();

    execSync( 'npx prisma migrate deploy', {
        cwd: resolve( __dirname, '..' ),
        env: process.env,
        stdio: 'inherit',
    });
}
