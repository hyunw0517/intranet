// [R-DOC-01] 에이전트가 세션마다 자동으로 읽는 문서의 크기 한도.
// Codex는 AGENTS.md를 기본 32KiB까지만 읽는다. 넘치면 뒷부분 규칙이 조용히 사라진다.
import fs from 'node:fs';
import path from 'node:path';
import { result } from '../lib/util.mjs';

export default {
  id: 'agents-size',
  title: '자동 로드 문서 크기',
  run({ root, config }) {
    const out = result();
    let total = 0;
    for (const [name, limit] of Object.entries(config.agentsSize ?? {})) {
      const abs = path.join(root, name);
      if (!fs.existsSync(abs)) {
        out.errors.push(`${name}이(가) 없다`);
        continue;
      }
      const bytes = fs.statSync(abs).size;
      total += bytes;
      const kb = (bytes / 1024).toFixed(1);
      if (bytes > limit.maxBytes) {
        out.errors.push(`${name} ${kb}KB > 한도 ${(limit.maxBytes / 1024).toFixed(0)}KB — 상세는 docs/로 옮기고 요약만 남긴다`);
      } else if (limit.warnBytes && bytes > limit.warnBytes) {
        out.warnings.push(`${name} ${kb}KB — 경고선 ${(limit.warnBytes / 1024).toFixed(0)}KB를 넘었다. 목차 역할을 하는지 점검`);
      }
    }
    out.notes.push(`자동 로드 합계 ${(total / 1024).toFixed(1)}KB`);
    return out;
  },
};
