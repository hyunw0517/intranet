// 세션 기록(jsonl)에서 토큰 사용량을 하네스 적용 전/후로 집계한다. 읽기 전용.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = path.join(os.homedir(), '.claude/projects/d--VScode-Workspace-portfolio-intranet');
const CUT = '2026-11-11'; // 하네스 적용일 (changelog v1.43)
const SELF = process.argv[2]; // 지금 세션 id (제외)

const sessions = [];
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl'))) {
  const id = f.replace('.jsonl', '');
  if (id === SELF) continue;
  const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(Boolean);
  const seen = new Map(); // message.id → usage (스트리밍으로 같은 응답이 여러 줄)
  let start = null, tools = 0, stopHook = 0, stopRuns = 0, compacts = 0, preDeny = 0, preAsk = 0, models = new Set();
  const reads = new Map();
  let firstCtx = null;
  for (const l of lines) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e.timestamp && (!start || e.timestamp < start)) start = e.timestamp;
    if (e.subtype === 'stop_hook_summary') { stopRuns++; if (e.hookErrors?.length || e.preventedContinuation) stopHook++; }
    if (e.subtype === 'compact_boundary') compacts++;
    if (e.attachment?.hookEvent === 'PreToolUse') {
      const o = e.attachment.stdout || '';
      if (o.includes('"permissionDecision":"deny"')) preDeny++;
      else if (o.includes('"permissionDecision":"ask"')) preAsk++;
    }
    if (e.type !== 'assistant' || !e.message) continue;
    const m = e.message;
    if (m.model && m.model !== '<synthetic>') models.add(m.model);
    for (const c of Array.isArray(m.content) ? m.content : []) {
      if (c.type === 'tool_use') {
        tools++;
        const p = c.input?.file_path;
        if (c.name === 'Read' && p) reads.set(p, (reads.get(p) || 0) + 1);
      }
    }
    if (m.usage && m.id && !seen.has(m.id)) {
      seen.set(m.id, m.usage);
      if (!firstCtx) firstCtx = (m.usage.cache_creation_input_tokens || 0) + (m.usage.cache_read_input_tokens || 0) + (m.usage.input_tokens || 0);
    }
  }
  if (!seen.size || !start) continue;
  const u = { in: 0, cw: 0, cr: 0, out: 0 };
  for (const x of seen.values()) {
    u.in += x.input_tokens || 0; u.cw += x.cache_creation_input_tokens || 0;
    u.cr += x.cache_read_input_tokens || 0; u.out += x.output_tokens || 0;
  }
  const reRead = [...reads.values()].reduce((s, n) => s + Math.max(0, n - 1), 0);
  const day = new Date(start).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  sessions.push({ id, day, resp: seen.size, ...u, tools, stopHook, stopRuns, compacts, preDeny, preAsk, reRead, firstCtx, models: [...models] });
}

const period = (d) => (d < CUT ? '적용 전' : d === CUT ? '적용 당일' : '적용 후');
const groups = {};
for (const s of sessions) (groups[period(s.day)] ??= []).push(s);

const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toString());
const avg = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
const med = (a, f) => { const v = a.map(f).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };

const order = ['적용 전', '적용 당일', '적용 후'];
const rows = [
  ['세션 수', (g) => g.length],
  ['기간', (g) => `${g.map((s) => s.day).sort()[0].slice(5)} ~ ${g.map((s) => s.day).sort().at(-1).slice(5)}`],
  ['세션당 응답 수 (평균)', (g) => avg(g, (s) => s.resp).toFixed(0)],
  ['세션당 출력 토큰 (평균)', (g) => k(avg(g, (s) => s.out))],
  ['세션당 캐시 쓰기 (평균)', (g) => k(avg(g, (s) => s.cw))],
  ['세션당 캐시 읽기 (평균)', (g) => k(avg(g, (s) => s.cr))],
  ['세션당 비캐시 입력 (평균)', (g) => k(avg(g, (s) => s.in))],
  ['세션당 총 처리 토큰 (평균)', (g) => k(avg(g, (s) => s.in + s.cw + s.cr + s.out))],
  ['세션당 총 처리 토큰 (중앙값)', (g) => k(med(g, (s) => s.in + s.cw + s.cr + s.out))],
  ['응답당 출력 토큰', (g) => k(g.reduce((a, s) => a + s.out, 0) / g.reduce((a, s) => a + s.resp, 0))],
  ['응답당 입력 맥락 (캐시 포함)', (g) => k(g.reduce((a, s) => a + s.in + s.cw + s.cr, 0) / g.reduce((a, s) => a + s.resp, 0))],
  ['시작 맥락 크기 (첫 응답, 중앙값)', (g) => k(med(g, (s) => s.firstCtx))],
  ['세션당 응답 수 (중앙값)', (g) => med(g, (s) => s.resp)],
  ['세션당 출력 토큰 (중앙값)', (g) => k(med(g, (s) => s.out))],
  ['총 처리 토큰 10M 넘는 세션', (g) => g.filter((s) => s.in + s.cw + s.cr + s.out > 1e7).length],
  ['compact 발생 (합계)', (g) => g.reduce((a, s) => a + s.compacts, 0)],
  ['세션당 도구 호출 (평균)', (g) => avg(g, (s) => s.tools).toFixed(0)],
  ['세션당 도구 호출 (중앙값)', (g) => med(g, (s) => s.tools)],
  ['세션당 같은 파일 다시 읽기 (평균)', (g) => avg(g, (s) => s.reRead).toFixed(1)],
  ['Stop hook 실행 / 차단 (합계)', (g) => `${g.reduce((a, s) => a + s.stopRuns, 0)} / ${g.reduce((a, s) => a + s.stopHook, 0)}`],
  ['PreToolUse 확인 요청 / 차단 (합계)', (g) => `${g.reduce((a, s) => a + s.preAsk, 0)} / ${g.reduce((a, s) => a + s.preDeny, 0)}`],
];
const present = order.filter((o) => groups[o]);
console.log(`| 지표 | ${present.join(' | ')} |`);
console.log(`|---|${present.map(() => '---:').join('|')}|`);
for (const [name, f] of rows) console.log(`| ${name} | ${present.map((o) => f(groups[o])).join(' | ')} |`);

console.log('\n모델:');
for (const o of present) {
  const c = {}; for (const s of groups[o]) for (const m of s.models) c[m] = (c[m] || 0) + 1;
  console.log(o, JSON.stringify(c));
}
