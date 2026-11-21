#!/usr/bin/env node
// git hook을 harness/git-hooks 폴더에서 바로 쓰도록 연결한다(파일 복사 없음 → hook을 고치면 바로 반영).
//   git init   # 아직 저장소가 아니면
//   node harness/install-git-hooks.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ROOT } from './lib/util.mjs';

const r = spawnSync('git', ['config', 'core.hooksPath', 'harness/git-hooks'], { cwd: DEFAULT_ROOT, encoding: 'utf8' });
if (r.status !== 0) {
  console.error('git 저장소가 아니거나 git이 없다. 먼저 git init을 실행한다.\n' + (r.stderr ?? ''));
  process.exit(1);
}
try {
  fs.chmodSync(path.join(DEFAULT_ROOT, 'harness', 'git-hooks', 'pre-commit'), 0o755);
} catch {
  /* Windows에서는 필요 없음 */
}
console.log('core.hooksPath = harness/git-hooks 설정 완료. 커밋할 때마다 verify가 돈다.');
