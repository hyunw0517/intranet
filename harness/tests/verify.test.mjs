import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRepo } from './helpers.mjs';
import { verify } from '../verify.mjs';

const pkg = (scripts) => JSON.stringify({ scripts });
const fail = 'node -e "process.exit(1)"';
const ok = 'node -e "process.exit(0)"';

function repo(stopScripts) {
  const root = makeRepo({ 'backend/package.json': pkg({ typecheck: ok, 'lint:check': fail }) });
  fs.mkdirSync(path.join(root, 'backend/node_modules'));
  const cfgPath = path.join(root, 'harness/harness.config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.packages = ['backend'];
  cfg.stopHook.scripts = stopScripts;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  return root;
}

const pkgResults = (report) => report.results.filter((r) => r.id.startsWith('backend:')).map((r) => [r.id, r.errors.length]);

test('verify --stop: 패키지별 스크립트 설정을 따른다 (lint 기준선이 깨진 패키지는 typecheck만)', () => {
  const report = verify(repo({ backend: ['typecheck'] }), ['--stop']);
  assert.deepEqual(pkgResults(report), [['backend:typecheck', 0]]);
});

test('verify --stop: 배열이면 모든 패키지에 같은 스크립트', () => {
  const report = verify(repo(['typecheck', 'lint:check']), ['--stop']);
  assert.deepEqual(pkgResults(report), [['backend:typecheck', 0], ['backend:lint:check', 1]]);
  assert.equal(report.ok, false);
});
