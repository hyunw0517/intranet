// [R-DOC-03] 규칙 대장(harness/rules.json)과 문서의 규칙 태그([R-XXX-00])가 서로 맞는지,
// 그리고 각 규칙이 무엇으로 강제되는지 확인한다.
//
// 이 검사가 하네스의 중심이다. 문서에만 있는 규칙은 에이전트가 잊으면 끝이므로,
// 모든 규칙에 "강제 수단"(check / hook / test / git-hook / manual)을 적게 하고
// manual(사람·에이전트 판단에만 맡김)로 남은 규칙 수를 매번 보고한다 = 하네스 부채.
import fs from 'node:fs';
import path from 'node:path';
import { docFiles, rel, result, stripFences } from '../lib/util.mjs';

const TAG = /\[(R-[A-Z]+-\d{2})\]/g;
const TYPES = new Set(['check', 'hook', 'test', 'git-hook', 'lint', 'manual']);

export default {
  id: 'rules-registry',
  title: '규칙 대장',
  run({ root, config, rules, checkIds }) {
    const out = result();
    const byId = new Map();
    for (const r of rules) {
      if (byId.has(r.id)) out.errors.push(`rules.json: ${r.id} 중복`);
      byId.set(r.id, r);
    }

    // 1) 문서에 쓴 태그는 대장에 있어야 한다
    const referenced = new Map(); // id -> 첫 위치
    for (const file of docFiles(root, config)) {
      const lines = stripFences(fs.readFileSync(file, 'utf8'));
      lines.forEach((raw, i) => {
        const line = raw.replace(/`[^`]*`/g, ''); // 인라인 코드 속 태그는 예시로 본다
        for (const m of line.matchAll(TAG)) {
          const where = `${rel(root, file)}:${i + 1}`;
          if (!byId.has(m[1])) out.errors.push(`${where} 대장에 없는 규칙 ${m[1]} — harness/rules.json에 등록`);
          if (!referenced.has(m[1])) referenced.set(m[1], where);
        }
      });
    }

    // 2) 대장의 규칙은 문서 어딘가에 있어야 한다(에이전트가 볼 수 있도록)
    let manual = 0;
    for (const r of rules) {
      if (!referenced.has(r.id)) out.errors.push(`${r.id} "${r.title}"이(가) 어떤 문서에도 없다 — AGENTS.md나 docs에 태그와 함께 적는다`);
      if (!Array.isArray(r.enforcedBy) || r.enforcedBy.length === 0) {
        out.errors.push(`${r.id}: enforcedBy가 비어 있다`);
        continue;
      }
      // 3) 강제 수단이 실제로 있는지
      for (const e of r.enforcedBy) {
        if (!TYPES.has(e.type)) {
          out.errors.push(`${r.id}: 알 수 없는 강제 수단 type "${e.type}"`);
        } else if (e.type === 'check') {
          if (!checkIds.includes(e.id)) out.errors.push(`${r.id}: 없는 검사 id "${e.id}"`);
        } else if (e.type === 'manual') {
          if (!e.reason) out.errors.push(`${r.id}: manual에는 reason(왜 자동화하지 않았나)을 적는다`);
        } else if (e.path && !fs.existsSync(path.join(root, e.path))) {
          // 빈 프로젝트에서는 테스트 파일이 아직 없을 수 있다 → 경고(부채로 표시)
          out.warnings.push(`${r.id}: ${e.type} 파일이 아직 없다 → ${e.path}`);
        }
      }
      if (r.enforcedBy.every((e) => e.type === 'manual')) manual++;
    }
    out.notes.push(`규칙 ${rules.length}개 · 자동 강제 ${rules.length - manual}개 · 판단에만 맡긴 규칙 ${manual}개`);
    return out;
  },
};
