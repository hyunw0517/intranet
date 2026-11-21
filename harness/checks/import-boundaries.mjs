// [R-ARCH-01] 모듈 사이의 import 방향.
// "핵심은 애드온을 모른다", "기능 폴더끼리 서로 import하지 않는다" 같은 구조 규칙을 문서가 아니라 검사로 지킨다.
// boundaries는 배열: 소스 루트(백엔드 src, 프론트 features 등)마다 하나씩.
// 모듈 = srcRoot 바로 아래 폴더 이름. srcRoot 바로 아래 파일(app.module.ts 등)은 제한 없음.
// from/to에 "*"를 쓰면 모든 모듈, allow에 "a->b"로 개별 허용.
// requireClassified: true면 모든 모듈이 규칙 또는 unrestricted([{ module, reason }])에 있어야 한다 (R-ARCH-02).
import fs from 'node:fs';
import path from 'node:path';
import { rel, result, toPosix, walk } from '../lib/util.mjs';

const IMPORT =
  /(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

/** 파일 내용에서 import 경로와 줄 번호를 뽑는다 (주석 속 import는 무시) */
export function extractImports(text) {
  const noComments = text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  const found = [];
  for (const m of noComments.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    const line = noComments.slice(0, m.index + m[0].length).split('\n').length;
    found.push({ spec, line });
  }
  return found;
}

/** import 경로 → srcRoot 기준 모듈 이름. 외부 패키지면 null */
export function targetModule(spec, fromFile, srcAbs, aliases) {
  let abs = null;
  if (spec.startsWith('.')) abs = path.resolve(path.dirname(fromFile), spec);
  else {
    for (const [prefix, dir] of Object.entries(aliases)) {
      if (spec === prefix.replace(/\/$/, '') || spec.startsWith(prefix)) {
        abs = path.resolve(srcAbs, dir, spec.slice(prefix.length));
        break;
      }
    }
  }
  if (!abs) return null;
  const r = toPosix(path.relative(srcAbs, abs));
  if (r.startsWith('..') || !r.includes('/')) return null; // src 밖이거나 src 바로 아래 파일
  return r.split('/')[0];
}

export function moduleOf(file, srcAbs) {
  const r = toPosix(path.relative(srcAbs, file));
  return r.includes('/') ? r.split('/')[0] : null;
}

const matches = (list, name) => list.includes('*') || list.includes(name);

export default {
  id: 'import-boundaries',
  title: '모듈 의존 방향',
  run({ root, config }) {
    const out = result();
    const layers = config.boundaries ?? [];
    if (layers.length === 0) {
      out.warnings.push('모듈 경계가 아직 선언되지 않았다 — 코드 구조가 정해지면 harness.config.json boundaries에 추가 (harness/examples/ 참고)');
      return out;
    }
    for (const cfg of layers) {
      const srcAbs = path.join(root, cfg.srcRoot);
      const ignore = cfg.ignoreSuffixes ?? [];
      const files = walk(srcAbs, (f) => /\.(ts|tsx|mts|js|mjs)$/.test(f) && !f.endsWith('.d.ts') && !ignore.some((s) => f.endsWith(s)));
      if (files.length === 0) {
        out.notes.push(`${cfg.srcRoot}: 소스 없음 — 건너뜀`);
        continue;
      }
      // [R-ARCH-02] requireClassified: srcRoot 바로 아래 모든 모듈이 규칙(from/to) 또는 unrestricted에 있어야 한다.
      // 새 모듈을 만들고 경계 설정에 넣지 않으면 그 모듈의 import는 아무 규칙에도 걸리지 않아 검사가 조용히 통과한다.
      // ("*" 규칙이 있으면 모든 모듈이 이미 대상이므로 확인하지 않는다)
      const rules = cfg.forbidden ?? [];
      if (cfg.requireClassified && !rules.some((r) => r.from.includes('*') || r.to.includes('*'))) {
        const listed = new Set([...rules.flatMap((r) => [...r.from, ...r.to]), ...(cfg.unrestricted ?? []).map((u) => u.module)]);
        const modules = [...new Set(files.map((f) => moduleOf(f, srcAbs)).filter(Boolean))].sort();
        for (const m of modules.filter((name) => !listed.has(name))) {
          out.errors.push(
            `${cfg.srcRoot}/${m} [R-ARCH-02] 경계 설정에 없는 모듈 — 어느 쪽(예: 핵심/애드온)인지 정해 harness.config.json boundaries의 규칙(from/to)에 넣거나, ` +
              `규칙이 필요 없으면 unrestricted에 이유와 함께 등록한다 (분류가 정해지지 않았으면 사용자에게 묻는다)`,
          );
        }
      }

      let edges = 0;
      for (const file of files) {
        const from = moduleOf(file, srcAbs);
        if (!from) continue;
        for (const { spec, line } of extractImports(fs.readFileSync(file, 'utf8'))) {
          const to = targetModule(spec, file, srcAbs, cfg.aliases ?? { 'src/': '.' });
          if (!to || to === from) continue;
          edges++;
          for (const rule of cfg.forbidden ?? []) {
            if (matches(rule.from, from) && matches(rule.to, to) && !(rule.allow ?? []).includes(`${from}->${to}`)) {
              out.errors.push(`${rel(root, file)}:${line} [${rule.rule}] ${from} → ${to} 금지: ${rule.message} (import '${spec}')`);
            }
          }
        }
      }
      out.notes.push(`${cfg.srcRoot}: 파일 ${files.length}개 · 모듈 간 import ${edges}개`);
    }
    return out;
  },
};
