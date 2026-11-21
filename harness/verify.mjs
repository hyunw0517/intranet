#!/usr/bin/env node
// 하네스 검증 진입점. 사람·에이전트·hook·pre-commit이 모두 이 한 명령을 쓴다.
//
//   node harness/verify.mjs                 하네스 검사 + 각 패키지 스크립트(typecheck, lint:check, test)
//   node harness/verify.mjs --quick         하네스 검사만 (1초 안쪽, SessionStart·pre-commit용)
//   node harness/verify.mjs --changed       git으로 바뀐 파일이 있는 패키지만 스크립트 실행
//   node harness/verify.mjs --stop          --changed + stopHook.scripts 설정대로 (Stop hook·pre-commit용)
//   node harness/verify.mjs --scripts=typecheck,lint:check   실행할 패키지 스크립트 지정
//   node harness/verify.mjs --only=route-guards              특정 검사만
//   node harness/verify.mjs --json          결과를 JSON으로
//
// 종료 코드: 0 통과 / 1 실패
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ROOT, isMain, loadConfig, loadRules, readJson, toPosix } from './lib/util.mjs';
import agentsSize from './checks/agents-size.mjs';
import docLinks from './checks/doc-links.mjs';
import docPaths from './checks/doc-paths.mjs';
import rulesRegistry from './checks/rules-registry.mjs';
import importBoundaries from './checks/import-boundaries.mjs';
import routeGuards from './checks/route-guards.mjs';

export const CHECKS = [agentsSize, docLinks, docPaths, rulesRegistry, importBoundaries, routeGuards];

export function parseArgs(argv) {
  const opts = { quick: false, changed: false, stop: false, json: false, only: null, scripts: null };
  for (const a of argv) {
    if (a === '--quick') opts.quick = true;
    else if (a === '--changed') opts.changed = true;
    else if (a === '--stop') opts.stop = opts.changed = true;
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--only=')) opts.only = a.slice(7).split(',');
    else if (a.startsWith('--scripts=')) opts.scripts = a.slice(10).split(',').filter(Boolean);
  }
  return opts;
}

/** git이 있으면 바뀐(추적·미추적) 파일 목록, 아니면 null */
export function changedFiles(root) {
  const r = spawnSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
}

export function runChecks(root, config, only) {
  const rules = loadRules(root);
  const ctx = { root, config, rules, checkIds: CHECKS.map((c) => c.id) };
  return CHECKS.filter((c) => !only || only.includes(c.id)).map((c) => {
    try {
      return { id: c.id, title: c.title, ...c.run(ctx) };
    } catch (e) {
      return { id: c.id, title: c.title, errors: [`검사 자체가 실패했다: ${e.message}`], warnings: [], notes: [] };
    }
  });
}

function runPackageScripts(root, config, opts) {
  const results = [];
  // stopHook.scripts는 배열(모든 패키지 공통) 또는 { 패키지: [스크립트] } — 기존 lint 오류가 남은 패키지만 typecheck로 낮출 때 쓴다
  const stopScripts = config.stopHook?.scripts ?? ['typecheck'];
  const scriptsFor = (pkg) =>
    opts.scripts ?? (opts.stop ? (Array.isArray(stopScripts) ? stopScripts : stopScripts[pkg] ?? []) : config.packageScripts ?? ['typecheck', 'lint:check', 'test']);
  const changed = opts.changed ? changedFiles(root) : null;
  for (const pkg of config.packages ?? []) {
    const pkgJson = path.join(root, pkg, 'package.json');
    if (!fs.existsSync(pkgJson)) continue;
    if (changed && !changed.some((f) => toPosix(f).startsWith(pkg + '/'))) continue;
    const defined = readJson(pkgJson).scripts ?? {};
    for (const s of scriptsFor(pkg)) {
      if (!defined[s]) {
        results.push({ id: `${pkg}:${s}`, skipped: true, errors: [], warnings: [`${pkg}/package.json에 "${s}" 스크립트가 없다 — harness/templates/package-scripts.md 참고`], notes: [] });
        continue;
      }
      if (!fs.existsSync(path.join(root, pkg, 'node_modules'))) {
        results.push({ id: `${pkg}:${s}`, skipped: true, errors: [], warnings: [`${pkg}/node_modules가 없다 — npm install 후 다시 실행`], notes: [] });
        continue;
      }
      const started = Date.now();
      const r = spawnSync('npm', ['run', s, '--silent'], { cwd: path.join(root, pkg), encoding: 'utf8', shell: true });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-30).join('\n');
      results.push({
        id: `${pkg}:${s}`,
        errors: r.status === 0 ? [] : [`npm run ${s} 실패 (${secs}s)\n${tail}`],
        warnings: [],
        notes: r.status === 0 ? [`통과 (${secs}s)`] : [],
      });
    }
  }
  return results;
}

export function verify(root = DEFAULT_ROOT, argv = []) {
  const opts = parseArgs(argv);
  const config = loadConfig(root);
  const results = runChecks(root, config, opts.only);
  if (!opts.quick && !opts.only) results.push(...runPackageScripts(root, config, opts));
  const errors = results.reduce((n, r) => n + r.errors.length, 0);
  const warnings = results.reduce((n, r) => n + r.warnings.length, 0);
  return { ok: errors === 0, errors, warnings, results };
}

export function format(report) {
  const lines = [];
  for (const r of report.results) {
    const mark = r.errors.length ? '✗' : r.skipped ? '–' : '✓';
    lines.push(`${mark} ${r.title ?? r.id}${r.notes?.length ? ' — ' + r.notes.join(', ') : ''}`);
    for (const e of r.errors) lines.push(`    오류  ${e.replace(/\n/g, '\n          ')}`);
    for (const w of r.warnings) lines.push(`    경고  ${w}`);
  }
  lines.push('');
  lines.push(report.ok ? `통과 (경고 ${report.warnings}개)` : `실패: 오류 ${report.errors}개, 경고 ${report.warnings}개`);
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const report = verify(DEFAULT_ROOT, argv);
  console.log(parseArgs(argv).json ? JSON.stringify(report, null, 2) : format(report));
  process.exit(report.ok ? 0 : 1);
}
