import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ROOT, loadConfig } from '../lib/util.mjs';
import { decideBash } from '../hooks/guard-bash.mjs';
import { decideEdit } from '../hooks/guard-edit.mjs';
import { relevant } from '../hooks/stop-verify.mjs';
import { section, lastHeading, devlogFile } from '../hooks/session-start.mjs';
import os from 'node:os';

const guards = loadConfig(DEFAULT_ROOT).guards;

test('guard-bash: 되돌릴 수 없는 명령은 deny', () => {
  for (const cmd of [
    'npx prisma migrate reset --force',
    'cd backend && npx prisma db push',
    'git push --force origin main',
    'git push -f',
    'git commit -m "x" --no-verify',
    'rm -rf /',
    'rm -rf .',
  ]) {
    assert.equal(decideBash(cmd, guards)?.decision, 'deny', cmd);
  }
});

test('guard-bash: 되돌리기 어려운 명령은 ask', () => {
  for (const cmd of ['git reset --hard HEAD~1', 'git checkout -- .', 'psql -c "TRUNCATE users"']) {
    assert.equal(decideBash(cmd, guards)?.decision, 'ask', cmd);
  }
});

test('guard-bash: 평범한 명령은 막지 않는다', () => {
  for (const cmd of [
    'npx prisma migrate dev --name add_users',
    'npx prisma generate',
    'git push origin feature/login',
    'git commit -m "fix: forced logout"',
    'rm -rf dist',
    'rm -rf node_modules/.cache',
    'npm run lint:check',
    'git checkout -b feature/x',
    'git restore src/a.ts',
  ]) {
    assert.equal(decideBash(cmd, guards), null, cmd);
  }
});

test('guard-edit: .env는 사용자 확인(ask), lock 파일은 막고, 예시 파일은 허용', () => {
  assert.equal(decideEdit('backend/.env', true, guards)?.decision, 'ask');
  assert.equal(decideEdit('backend/.env.test', false, guards)?.decision, 'ask');
  assert.equal(decideEdit('frontend/package-lock.json', true, guards)?.decision, 'deny');
  assert.equal(decideEdit('backend/.env.example', true, guards), null);
  assert.equal(decideEdit('backend/.env.test.example', true, guards), null);
  assert.equal(decideEdit('backend/src/env.ts', true, guards), null);
});

test('guard-edit: 기존 마이그레이션은 사용자 확인(ask), 새 마이그레이션·schema.prisma는 허용', () => {
  const m = 'backend/prisma/migrations/20261111_init/migration.sql';
  assert.equal(decideEdit(m, true, guards)?.decision, 'ask');
  assert.equal(decideEdit(m, false, guards), null);
  assert.equal(decideEdit('backend/prisma/schema.prisma', true, guards), null);
});

test('guard-edit: decision이 없는 규칙은 deny', () => {
  const g = { immutableIfExists: [{ pattern: 'x\\.sql$', reason: 'r' }] };
  assert.deepEqual(decideEdit('a/x.sql', true, g), { decision: 'deny', reason: 'r' });
});

test('guard-edit hook: ask 규칙은 실제 실행 시 permissionDecision ask JSON', () => {
  const dir = fs.readdirSync(path.join(DEFAULT_ROOT, 'backend/prisma/migrations')).find((d) => !d.includes('.'));
  const r = spawnSync(process.execPath, [path.join(DEFAULT_ROOT, 'harness/hooks/guard-edit.mjs')], {
    input: JSON.stringify({ tool_input: { file_path: path.join(DEFAULT_ROOT, 'backend/prisma/migrations', dir, 'migration.sql') } }),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('guard-edit hook: 실제 실행 시 exit 2 + stderr', () => {
  const r = spawnSync(process.execPath, [path.join(DEFAULT_ROOT, 'harness/hooks/guard-edit.mjs')], {
    input: JSON.stringify({ tool_input: { file_path: path.join(DEFAULT_ROOT, 'backend/package-lock.json') } }),
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /package-lock\.json 수정이 막혔다/);
});

test('guard-edit hook: .env는 실제 실행 시 ask JSON (사용자가 수락하면 수정된다)', () => {
  const r = spawnSync(process.execPath, [path.join(DEFAULT_ROOT, 'harness/hooks/guard-edit.mjs')], {
    input: JSON.stringify({ tool_input: { file_path: path.join(DEFAULT_ROOT, 'backend/.env') } }),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('guard-bash hook: 실제 실행 시 permissionDecision JSON', () => {
  const r = spawnSync(process.execPath, [path.join(DEFAULT_ROOT, 'harness/hooks/guard-bash.mjs')], {
    input: JSON.stringify({ tool_input: { command: 'npx prisma db push' } }),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('stop-verify: stop_hook_active면 아무것도 하지 않는다', () => {
  const r = spawnSync(process.execPath, [path.join(DEFAULT_ROOT, 'harness/hooks/stop-verify.mjs')], {
    input: JSON.stringify({ stop_hook_active: true }),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('stop-verify: 감시 대상 변경만 고른다', () => {
  assert.deepEqual(relevant(['backend/src/a.ts', 'notes.txt', 'AGENTS.md', 'frontend/x.tsx'], ['backend/', 'frontend/', 'AGENTS.md']), [
    'backend/src/a.ts',
    'AGENTS.md',
    'frontend/x.tsx',
  ]);
});

test('session-start: 처리할 작업 섹션과 마지막 devlog 제목을 뽑는다', () => {
  const plan = '# 일정\n\n## 처리할 작업\n\n- [ ] A\n- [ ] B\n\n## 일정\n- x\n';
  assert.equal(section(plan, '처리할 작업'), '- [ ] A\n- [ ] B');
  assert.equal(lastHeading('# t\n## 2026-11-01 · a\n## 2026-11-02 · b\n'), '2026-11-02 · b');
});

test('session-start: devlog 폴더면 README를 뺀 이름순 마지막 파일을 고른다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devlog-'));
  for (const n of ['README.md', '2026-11-09.md', '2026-11-16.md', 'notes.txt']) fs.writeFileSync(path.join(dir, n), '## x\n');
  assert.equal(devlogFile(dir), path.join(dir, '2026-11-16.md'));
  assert.equal(devlogFile(path.join(dir, 'README.md')), path.join(dir, 'README.md'));
  assert.equal(devlogFile(path.join(dir, 'none')), null);
  fs.rmSync(dir, { recursive: true });
});

test('session-start: 긴 섹션은 글자 수로 자른다', () => {
  const plan = '## 처리할 작업 (매일 갱신)\n' + '- 아주 긴 항목\n'.repeat(5);
  const s = section(plan, '처리할 작업', 15, 10);
  assert.match(s, /이하 생략/);
  assert.ok(s.length < 40);
});
