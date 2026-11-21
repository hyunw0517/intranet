#!/usr/bin/env node
// Claude Code PreToolUse hook (Edit / Write / MultiEdit / NotebookEdit)
// [R-SEC-01] .env·lock 파일 수정 금지, [R-DB-01] 이미 만든 마이그레이션 수정은 사용자 확인.
// 규칙마다 decision을 둔다: deny(기본, 막음) / ask(사용자 확인 창 — 수락하면 수정된다).
// - deny: exit 2 + stderr — Claude Code가 stderr를 Claude에게 돌려줘 다른 방법을 찾게 한다.
// - ask: permissionDecision JSON — guard-bash와 같은 방식.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ROOT, isMain, loadConfig, readStdin, toPosix } from '../lib/util.mjs';

/** @returns {null | { decision: 'deny'|'ask', reason: string }} 허용이면 null */
export function decideEdit(relPath, exists, guards) {
  const p = toPosix(relPath);
  const hit = (g) => ({ decision: g.decision ?? 'deny', reason: g.reason });
  for (const g of guards.protectedFiles ?? []) {
    if (new RegExp(g.pattern).test(p) && !(g.except && new RegExp(g.except).test(p))) return hit(g);
  }
  if (exists) {
    for (const g of guards.immutableIfExists ?? []) {
      if (new RegExp(g.pattern).test(p)) return hit(g);
    }
  }
  return null;
}

if (isMain(import.meta.url)) {
  const input = JSON.parse((await readStdin()) || '{}');
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!file) process.exit(0);
  const root = input.cwd && fs.existsSync(path.join(input.cwd, 'harness')) ? input.cwd : DEFAULT_ROOT;
  const abs = path.resolve(root, file);
  const relPath = path.relative(root, abs);
  if (relPath.startsWith('..')) process.exit(0); // 프로젝트 밖 파일은 관여하지 않는다
  const hit = decideEdit(relPath, fs.existsSync(abs), loadConfig(root).guards);
  if (!hit) process.exit(0);
  if (hit.decision === 'ask') {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `[하네스] ${toPosix(relPath)}: ${hit.reason}`,
        },
      }),
    );
    process.exit(0);
  }
  process.stderr.write(`[하네스] ${toPosix(relPath)} 수정이 막혔다: ${hit.reason}\n`);
  process.exit(2);
}
