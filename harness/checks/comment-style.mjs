// [R-DOC-05] 코드 주석의 이력·메타 표식 검사 — 정적 검사.
// 주석은 코드를 읽는 사람을 위한 것이라, 누가 언제 정했는지(결정 날짜·"사용자 결정")나
// 설계 문서 장 번호처럼 문서가 바뀌면 틀어지는 정보는 넣지 않는다. 이력은 devlog·git에 남는다.
// 문자열 안의 값은 보지 않는다. 예시 날짜("2026-12-01 ~ 2026-12-03")는 걸리지 않도록 날짜 단독이 아니라 "날짜 + 결정/요청"만 잡는다.
// 패턴은 harness.config.json의 commentStyle.patterns에서 고친다.
import fs from 'node:fs';
import path from 'node:path';
import { rel, result, walk } from '../lib/util.mjs';
import { maskStrings } from './route-guards.mjs';

/** 소스 → [{ line, text }] (// 주석과 블록 주석의 각 줄, 문자열 안은 제외) */
export function extractComments(text) {
  const out = [];
  let inBlock = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    let line = maskStrings(raw);
    let src = raw;
    while (line.length > 0) {
      if (inBlock) {
        const end = line.indexOf('*/');
        out.push({ line: i + 1, text: src.slice(0, end === -1 ? undefined : end) });
        if (end === -1) return;
        inBlock = false;
        line = line.slice(end + 2);
        src = src.slice(end + 2);
        continue;
      }
      const lineIdx = line.indexOf('//');
      const blockIdx = line.indexOf('/*');
      if (lineIdx === -1 && blockIdx === -1) return;
      if (lineIdx !== -1 && (blockIdx === -1 || lineIdx < blockIdx)) {
        out.push({ line: i + 1, text: src.slice(lineIdx + 2) });
        return;
      }
      inBlock = true;
      line = line.slice(blockIdx + 2);
      src = src.slice(blockIdx + 2);
    }
  });
  return out;
}

export default {
  id: 'comment-style',
  title: '주석 이력·메타 표식',
  run({ root, config }) {
    const out = result();
    const cfg = config.commentStyle;
    if (!cfg) {
      out.notes.push('commentStyle 설정 없음 — 건너뜀');
      return out;
    }
    const exts = cfg.extensions ?? ['.ts', '.tsx'];
    const excluded = (cfg.excludeDirs ?? []).map((d) => path.join(root, d));
    const patterns = (cfg.patterns ?? []).map((p) => ({ ...p, re: new RegExp(p.regex, 'u') }));

    let files = 0;
    for (const dir of cfg.roots ?? []) {
      const found = walk(path.join(root, dir), (f) => exts.some((e) => f.endsWith(e)) && !excluded.some((x) => f.startsWith(x + path.sep)));
      for (const file of found) {
        files++;
        for (const c of extractComments(fs.readFileSync(file, 'utf8'))) {
          for (const p of patterns) {
            const m = c.text.match(p.re);
            if (m) out.errors.push(`${rel(root, file)}:${c.line} [R-DOC-05] 주석에 ${p.message} — "${m[0]}"${p.hint ? ` (${p.hint})` : ''}`);
          }
        }
      }
    }
    out.notes.push(`파일 ${files}개 확인 · 패턴 ${patterns.length}개`);
    return out;
  },
};
