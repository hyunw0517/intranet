// [R-DOC-02] 문서의 상대 링크가 실제 파일을 가리키는지.
import fs from 'node:fs';
import path from 'node:path';
import { docFiles, rel, result, stripFences } from '../lib/util.mjs';

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export default {
  id: 'doc-links',
  title: '문서 링크',
  run({ root, config }) {
    const out = result();
    let count = 0;
    for (const file of docFiles(root, config)) {
      const lines = stripFences(fs.readFileSync(file, 'utf8'));
      lines.forEach((line, i) => {
        for (const m of line.matchAll(LINK)) {
          const target = m[1];
          if (/^(https?:|mailto:|#|computer:)/.test(target)) continue;
          count++;
          const clean = decodeURI(target.split('#')[0]);
          const abs = path.resolve(path.dirname(file), clean);
          if (!fs.existsSync(abs)) out.errors.push(`${rel(root, file)}:${i + 1} 깨진 링크 → ${target}`);
        }
      });
    }
    out.notes.push(`상대 링크 ${count}개 확인`);
    return out;
  },
};
