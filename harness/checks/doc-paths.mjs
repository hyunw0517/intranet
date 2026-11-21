// [R-DOC-02] 문서 본문에 백틱으로 적은 저장소 경로(`backend/src/...`)가 실제로 있는지.
// 설계 문서가 코드와 어긋나는 것(문서 드리프트)을 기계적으로 잡는 최소 장치다.
// - 펜스 코드 블록(계획 중인 폴더 트리 등)은 검사하지 않는다.
// - 파일 경로(확장자가 있음)와 폴더 경로(끝이 /)만 본다. `backend/audit` 같은 git 브랜치 이름과 섞이지 않게.
// - 아직 만들지 않은 경로는 그 줄, 그 표의 머리글, 또는 그 절 제목에 "예정"을 쓰면 경고만 낸다.
// - 이력 문서(devlog, changelog)는 그 시점의 사실이므로 config.docs.exclude로 뺀다.
import fs from 'node:fs';
import path from 'node:path';
import { docFiles, rel, result, stripFences } from '../lib/util.mjs';

const CODE = /`([^`\s]+)`/g;
const LOOKS_LIKE_PATH = /(\.[A-Za-z0-9]{1,6}|\/)$/;

export default {
  id: 'doc-paths',
  title: '문서 속 경로',
  run({ root, config }) {
    const out = result();
    const prefixes = config.docs?.pathPrefixes ?? ['backend/', 'frontend/', 'docs/', 'harness/', '.claude/'];
    let count = 0;
    for (const file of docFiles(root, config)) {
      const lines = stripFences(fs.readFileSync(file, 'utf8'));
      let heading = '';
      let tableHeader = '';
      lines.forEach((line, i) => {
        if (/^#{1,6}\s/.test(line)) heading = line;
        if (/^\s*\|/.test(line)) {
          if (/^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) tableHeader = line;
        } else tableHeader = '';
        for (const m of line.matchAll(CODE)) {
          const token = m[1].replace(/[),.:;]+$/, '');
          if (!prefixes.some((p) => token.startsWith(p))) continue;
          if (/[*<>{}$]|\.\.\./.test(token) || !LOOKS_LIKE_PATH.test(token)) continue;
          count++;
          if (fs.existsSync(path.join(root, token))) continue;
          const where = `${rel(root, file)}:${i + 1}`;
          if (/예정/.test(line) || /예정/.test(tableHeader) || /예정/.test(heading)) out.warnings.push(`${where} 아직 없는 경로(예정) → ${token}`);
          else out.errors.push(`${where} 존재하지 않는 경로 → ${token} (코드가 바뀌었으면 문서를 고치고, 계획이면 "(예정)" 표시)`);
        }
      });
    }
    out.notes.push(`경로 ${count}개 확인`);
    return out;
  },
};
