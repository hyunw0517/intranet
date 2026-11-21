// [R-AUTH-01] 모든 라우트 핸들러에 권한 데코레이터(@Roles / @IsPublic 등)가 있는지 — 정적 검사.
// RolesGuard가 "@Roles가 없으면 통과"로 동작하면, 데코레이터를 빠뜨린 API는 조용히 열린다.
// 에이전트가 잊어도 여기서 막히게 한다. 런타임 검사(harness/templates/roles-coverage.e2e-spec.ts)와 함께 쓴다.
//
// 정적 분석의 한계: 줄 단위로 읽으므로 데코레이터를 변수로 조합하거나 상속한 컨트롤러는 놓칠 수 있다.
// 그래서 런타임 e2e 템플릿을 같이 둔다.
import fs from 'node:fs';
import path from 'node:path';
import { rel, result, walk } from '../lib/util.mjs';

const HTTP = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Options', 'Head', 'Search']);
const METHOD_SIG = /^\s*(?:(?:public|private|protected|static|override|readonly)\s+)*(?:async\s+)?\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/;
const CLASS_SIG = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;

// 한 줄 문자열 리터럴의 내용을 공백으로 바꾼다 (따옴표는 남김).
// 문자열 안의 괄호("[from, to)")가 데코레이터 괄호 깊이 계산을, 문자열 안의 "//"("http://")가 주석 제거를 망가뜨리지 않게 한다.
// (2026-11-22: Swagger 설명의 "[start, end)" 때문에 라우트 5개가 이 검사에서 빠진 것을 api-docs 검사를 만들다 발견)
const STRING_LITERAL = /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\\n])*`/g;
export function maskStrings(line) {
  return line.replace(STRING_LITERAL, (s) => s[0] + ' '.repeat(s.length - 2) + s[s.length - 1]);
}

/** 컨트롤러 소스 → [{ className, method, line, http, decorators:Set, classDecorators:Set }] */
export function parseController(text) {
  const lines = text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split(/\r?\n/)
    .map(maskStrings);
  const routes = [];
  let pending = [];
  let className = null;
  let classDecorators = new Set();
  let skipDepth = 0; // 여러 줄에 걸친 매개변수 목록(@Body() 등)을 건너뛰기 위한 괄호 깊이
  let decoDepth = 0; // 여러 줄에 걸친 데코레이터 인자(@Roles(\n ... \n))

  const parenDelta = (s) => (s.match(/\(/g)?.length ?? 0) - (s.match(/\)/g)?.length ?? 0);

  lines.forEach((raw, i) => {
    const rawLine = raw.replace(/\/\/.*$/, '');
    if (skipDepth > 0) {
      skipDepth += parenDelta(rawLine);
      return;
    }
    if (decoDepth > 0) {
      decoDepth += parenDelta(rawLine);
      return;
    }
    let line = rawLine;
    if (/^\s*@/.test(line)) {
      // 줄 앞의 데코레이터를 하나씩 떼어 낸다: "@IsPublic() @Get('h') health() {}" → pending에 넣고 "health() {}"만 남김
      let rest = line;
      let m;
      while ((m = rest.match(/^\s*@([A-Za-z_$][\w$]*)/))) {
        pending.push(m[1]);
        rest = rest.slice(m[0].length);
        if (rest.startsWith('(')) {
          let depth = 0;
          let i = 0;
          for (; i < rest.length; i++) {
            if (rest[i] === '(') depth++;
            else if (rest[i] === ')' && --depth === 0) break;
          }
          if (depth > 0) {
            decoDepth = depth; // 인자가 다음 줄로 이어진다: @Roles(\n ...\n)
            return;
          }
          rest = rest.slice(i + 1);
        }
      }
      if (rest.trim() === '') return;
      line = rest;
    }
    const cls = line.match(CLASS_SIG);
    if (cls) {
      className = cls[1];
      classDecorators = new Set(pending);
      pending = [];
      return;
    }
    const sig = line.match(METHOD_SIG);
    if (sig && className && !['if', 'for', 'while', 'switch', 'catch', 'return', 'constructor'].includes(sig[1])) {
      const http = pending.find((d) => HTTP.has(d));
      if (http) routes.push({ className, method: sig[1], line: i + 1, http, decorators: new Set(pending), classDecorators });
      pending = [];
      skipDepth = Math.max(0, parenDelta(line));
      return;
    }
    if (line.trim() !== '') pending = [];
  });
  return routes;
}

export default {
  id: 'route-guards',
  title: '라우트 권한 데코레이터',
  run({ root, config }) {
    const out = result();
    const cfg = config.routeGuards;
    if (!cfg) {
      out.notes.push('routeGuards 설정 없음 — 건너뜀');
      return out;
    }
    const srcAbs = path.join(root, cfg.srcRoot);
    const files = walk(srcAbs, (f) => f.endsWith(cfg.fileSuffix ?? '.controller.ts'));
    if (files.length === 0) {
      out.notes.push(`${cfg.srcRoot}에 컨트롤러가 아직 없다 — 건너뜀`);
      return out;
    }
    const allow = new Map((cfg.allowlist ?? []).map((a) => [a.route, a.reason]));
    const seen = new Set();
    let total = 0;
    for (const file of files) {
      for (const r of parseController(fs.readFileSync(file, 'utf8'))) {
        total++;
        const key = `${r.className}.${r.method}`;
        seen.add(key);
        const ok = cfg.authDecorators.some((d) => r.decorators.has(d) || r.classDecorators.has(d));
        if (ok) continue;
        if (allow.has(key)) continue;
        out.errors.push(
          `${rel(root, file)}:${r.line} [R-AUTH-01] ${key} (@${r.http}) — ${cfg.authDecorators.map((d) => '@' + d).join(' / ')} 중 하나를 붙이거나, 본인 계정용이면 harness.config.json routeGuards.allowlist에 이유와 함께 등록. 어떤 역할이 맞는지 정해지지 않았으면 임의로 고르지 말고 사용자에게 묻는다`,
        );
      }
    }
    for (const key of allow.keys()) {
      if (!seen.has(key)) out.warnings.push(`allowlist의 ${key}에 해당하는 라우트가 없다 — 이름이 바뀌었으면 고치고, 지웠으면 목록에서 뺀다`);
    }
    out.notes.push(`컨트롤러 ${files.length}개 · 라우트 ${total}개 확인 · 예외 ${allow.size}개`);
    return out;
  },
};
