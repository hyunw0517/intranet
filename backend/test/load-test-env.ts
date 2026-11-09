import { config } from 'dotenv';
import { resolve } from 'node:path';

//* e2e 테스트 환경변수: .env.test를 먼저 넣는다. (각 테스트 파일 실행 전, globalSetup에서도 사용)
// - override: 셸에 DATABASE_URL이 남아 있어도 테스트 DB로 바꾼다.
// - ConfigModule은 이미 있는 process.env 값을 .env로 덮어쓰지 않으므로 앱도 테스트 DB에 붙는다.
// - DB 이름이 _test로 끝나지 않으면 여기서 멈춘다. (TRUNCATE가 개발 DB에 닿지 않게)
export function loadTestEnv() {
    config({ path: resolve( __dirname, '../.env.test' ), override: true, quiet: true });

    const url = process.env.DATABASE_URL;
    const dbName = url ? new URL( url ).pathname.slice( 1 ) : '';
    if ( !dbName.endsWith( '_test' ) ) {
        throw new Error( `e2e 테스트는 이름이 _test로 끝나는 DB에서만 실행한다. (현재: "${dbName}") backend/.env.test를 확인하세요.` );
    }
}

loadTestEnv();
