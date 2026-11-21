#!/usr/bin/env node
// Claude Code SessionStart hook — 새 세션이 "이전 세션이 어디까지 했는지" 알고 시작하게 한다.
// (Anthropic "Effective harnesses for long-running agents"의 진행 파일 + 시작 의식 아이디어)
// stdout으로 출력한 내용이 세션 맥락에 추가된다. 짧게 유지한다(2KB 안팎).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_ROOT, isMain, loadConfig } from '../lib/util.mjs';
import { verify } from '../verify.mjs';

/** 마크다운에서 "## <제목>"으로 시작하는 섹션 본문을 최대 maxLines줄 · maxChars자 */
export function section(text, title, maxLines = 15, maxChars = Infinity) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.replace(/^#+\s*/, '').trim().startsWith(title) && /^##\s/.test(l));
  if (start < 0) return null;
  const body = [];
  for (const l of lines.slice(start + 1)) {
    if (/^##\s/.test(l)) break;
    if (l.trim()) body.push(l);
  }
  const joined = body.slice(0, maxLines).join('\n');
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}\n… (이하 생략 — 원문을 읽는다)` : joined;
}

export function lastHeading(text) {
  const hs = text.split(/\r?\n/).filter((l) => /^##\s/.test(l));
  return hs.length ? hs[hs.length - 1].replace(/^##\s*/, '') : null;
}

/** devlog가 폴더면(주 단위 파일) 이름순 마지막 파일, 파일이면 그대로. README.md는 목록이라 뺀다 */
export function devlogFile(p) {
  if (!fs.existsSync(p)) return null;
  if (!fs.statSync(p).isDirectory()) return p;
  const names = fs.readdirSync(p).filter((n) => n.endsWith('.md') && n.toLowerCase() !== 'readme.md').sort();
  return names.length ? path.join(p, names[names.length - 1]) : null;
}

function build(root) {
  const cfg = { plan: 'docs/plan.md', planSection: '처리할 작업', devlog: 'docs/devlog.md', maxLines: 15, maxChars: 2000, ...(loadConfig(root).sessionStart ?? {}) };
  const out = ['# 하네스 세션 시작 정보'];
  const plan = path.join(root, cfg.plan);
  if (fs.existsSync(plan)) {
    const todo = section(fs.readFileSync(plan, 'utf8'), cfg.planSection, cfg.maxLines, cfg.maxChars);
    out.push('', `## ${cfg.planSection} (${cfg.plan})`, todo || '(비어 있음)');
  }
  const devlog = devlogFile(path.join(root, cfg.devlog));
  if (devlog) {
    const h = lastHeading(fs.readFileSync(devlog, 'utf8'));
    if (h) out.push('', `## 마지막 devlog 항목 (${path.relative(root, devlog).split(path.sep).join('/')})`, h);
  }
  const git = spawnSync('git', ['log', '--oneline', '-5'], { cwd: root, encoding: 'utf8' });
  if (git.status === 0 && git.stdout.trim()) out.push('', '## 최근 커밋', git.stdout.trim());

  const report = verify(root, ['--quick']);
  const summary = report.results.find((r) => r.id === 'rules-registry')?.notes?.[0] ?? '';
  out.push('', '## 하네스 점검 (verify --quick)', report.ok ? `통과 · 경고 ${report.warnings}개 · ${summary}` : `실패: 오류 ${report.errors}개 — 작업 전에 \`node harness/verify.mjs --quick\`으로 확인`);
  return out.join('\n');
}

if (isMain(import.meta.url)) {
  try {
    console.log(build(DEFAULT_ROOT));
  } catch (e) {
    console.log(`[하네스] 세션 시작 정보를 만들지 못했다: ${e.message}`);
  }
}
