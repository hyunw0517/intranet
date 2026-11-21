#!/usr/bin/env node
// harness/claude/ → .claude/ 복사 (hook 연결 settings.json + skill).
// 원격 도구는 .claude 폴더에 쓸 수 없어서, 처음 한 번은 사용자가 직접 실행한다.
//   node harness/install-claude.mjs           없는 파일만 복사
//   node harness/install-claude.mjs --force   이미 있어도 덮어씀
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ROOT, rel, walk } from './lib/util.mjs';

const force = process.argv.includes('--force');
const src = path.join(DEFAULT_ROOT, 'harness', 'claude');
const dest = path.join(DEFAULT_ROOT, '.claude');

for (const file of walk(src)) {
  const target = path.join(dest, path.relative(src, file));
  const name = rel(DEFAULT_ROOT, target);
  if (fs.existsSync(target) && !force) {
    const same = fs.readFileSync(target, 'utf8') === fs.readFileSync(file, 'utf8');
    console.log(`${same ? '같음' : '건너뜀(다름, --force로 덮어쓰기)'}  ${name}`);
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
  console.log(`복사  ${name}`);
}
console.log('\n완료. Claude Code를 이 폴더에서 새로 열면 hook과 skill이 적용된다.');
