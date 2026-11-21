#!/usr/bin/env node
// Claude Code Stop hook — [R-VER-01] 응답을 끝내기 전에 검증을 돌리고, 실패하면 끝내지 못하게 한다.
//
// 동작
// 1. stop_hook_active(이미 이 hook 때문에 한 번 더 일한 상태)면 그냥 통과 → 무한 반복 방지
// 2. git으로 바뀐 파일을 보고, 감시 대상(stopHook.watch)에 변경이 없으면 통과 (질문·설명만 한 턴은 비용 0)
// 3. 바뀐 파일 + 수정 시각이 마지막 통과 때와 같으면 통과 (같은 상태를 두 번 검증하지 않음)
// 4. verify --stop 실행(바뀐 패키지만, stopHook.scripts 설정대로). 실패하면 {"decision":"block"}으로 Claude에게 돌려준다
//
// git 저장소가 아니면 하네스 검사(--quick)만 한다.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ROOT, isMain, loadConfig, readStdin, toPosix } from '../lib/util.mjs';
import { changedFiles } from '../verify.mjs';

const STATE = path.join(DEFAULT_ROOT, '.claude', 'harness-state.json');

export function fingerprint(root, files) {
  const h = crypto.createHash('sha1');
  for (const f of [...files].sort()) {
    const abs = path.join(root, f);
    const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
    h.update(`${f}|${st ? `${st.size}:${st.mtimeMs}` : 'deleted'}\n`);
  }
  return h.digest('hex');
}

export function relevant(files, watch) {
  return files.filter((f) => watch.some((w) => toPosix(f) === w || toPosix(f).startsWith(w)));
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return {};
  }
}

if (isMain(import.meta.url)) {
  const input = JSON.parse((await readStdin()) || '{}');
  if (input.stop_hook_active) process.exit(0);

  const root = DEFAULT_ROOT;
  const config = loadConfig(root);
  const changed = changedFiles(root);
  let args;
  let fp = null;

  if (changed === null) {
    args = ['--quick'];
  } else {
    const files = relevant(changed, config.stopHook?.watch ?? ['backend/', 'frontend/']);
    if (files.length === 0) process.exit(0);
    fp = fingerprint(root, files);
    if (readState().lastPass === fp) process.exit(0);
    args = ['--stop'];
  }

  const r = spawnSync(process.execPath, [path.join(root, 'harness', 'verify.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  if (r.status === 0) {
    if (fp) {
      fs.mkdirSync(path.dirname(STATE), { recursive: true });
      fs.writeFileSync(STATE, JSON.stringify({ lastPass: fp, at: new Date().toISOString() }, null, 2));
    }
    process.exit(0);
  }
  const report = `${r.stdout}${r.stderr}`.trim().split('\n').slice(-40).join('\n');
  console.log(
    JSON.stringify({
      decision: 'block',
      reason:
        `[하네스] 검증 실패. 아래 순서로 판단한다.\n` +
        `1. 사용자에게 업무 결정(권한·규칙·데이터 구조 등)을 물어보려고 멈춘 상태라면: 고치지 말고, 질문과 함께 "검증이 아직 실패 중"이라고 알리고 끝낸다. 검사를 통과시키려고 임시 값을 정하지 않는다.\n` +
        `2. 이번 작업 범위 밖의 실패이거나 고칠 수 없으면: 고치지 말고 무엇이 왜 실패하는지 보고하고 끝낸다.\n` +
        `3. 그 외에는 고친 뒤 마무리한다.\n\n` +
        report,
    }),
  );
}
