#!/usr/bin/env node
// Claude Code PreToolUse hook (Bash)
// [R-DB-02] DB를 되돌릴 수 없게 바꾸는 명령, [R-GIT-01] 검증 우회·강제 푸시를 막거나 사용자에게 묻는다.
// 규칙 목록은 harness.config.json guards.bash — deny(막음) / ask(사용자 확인).
import { DEFAULT_ROOT, isMain, loadConfig, readStdin } from '../lib/util.mjs';

/** @returns {null | { decision: 'deny'|'ask', reason: string }} */
export function decideBash(command, guards) {
  // deny가 ask보다 우선한다
  const hits = (guards.bash ?? []).filter((g) => new RegExp(g.pattern, 'i').test(command));
  return hits.find((g) => g.decision === 'deny') ?? hits[0] ?? null;
}

if (isMain(import.meta.url)) {
  const input = JSON.parse((await readStdin()) || '{}');
  const command = input.tool_input?.command;
  if (!command) process.exit(0);
  const hit = decideBash(command, loadConfig(DEFAULT_ROOT).guards);
  if (hit) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: hit.decision,
          permissionDecisionReason: `[하네스] ${hit.reason}`,
        },
      }),
    );
  }
}
