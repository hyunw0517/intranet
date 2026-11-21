// 테스트용 임시 저장소를 만든다. 실제 harness 설정을 복사하고, 넘긴 파일을 덧붙인다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_ROOT } from '../lib/util.mjs';

/** 프로젝트 설정에서 프로젝트 전용 값(모듈 경계, 예외 목록, 문서 제외)을 비운 것 — 테스트가 어느 프로젝트에서든 같게 돌도록 */
export function baseConfig() {
  const c = JSON.parse(fs.readFileSync(path.join(DEFAULT_ROOT, 'harness/harness.config.json'), 'utf8'));
  c.boundaries = [];
  if (c.routeGuards) c.routeGuards.allowlist = [];
  if (c.docs) c.docs.exclude = [];
  return c;
}

export function makeRepo(files = {}, { config, rules } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-'));
  const write = (rel, content) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  write('harness/harness.config.json', JSON.stringify(config ?? baseConfig()));
  write('harness/rules.json', JSON.stringify({ rules: rules ?? [] }));
  if (!('AGENTS.md' in files)) write('AGENTS.md', '# test\n');
  if (!('CLAUDE.md' in files)) write('CLAUDE.md', '@AGENTS.md\n');
  for (const [rel, content] of Object.entries(files)) write(rel, content);
  return root;
}

export function ctx(root, extra = {}) {
  return {
    root,
    config: JSON.parse(fs.readFileSync(path.join(root, 'harness/harness.config.json'), 'utf8')),
    rules: JSON.parse(fs.readFileSync(path.join(root, 'harness/rules.json'), 'utf8')).rules,
    checkIds: ['agents-size', 'doc-links', 'doc-paths', 'rules-registry', 'import-boundaries', 'route-guards', 'api-docs'],
    ...extra,
  };
}
