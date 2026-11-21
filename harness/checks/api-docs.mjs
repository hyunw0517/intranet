// [R-DOC-04] API 문서(Swagger) 누락 검사 — 정적 검사.
// - 라우트 핸들러마다 @ApiOperation(summary)이 있어야 한다. 없으면 문서에 설명 없이 이름만 나온다.
// - 라우트가 있는 컨트롤러에는 @ApiTags가 있어야 한다. 없으면 문서의 "default" 묶음에 섞인다.
// - 문서에서 일부러 뺀 라우트는 @ApiExcludeEndpoint, 컨트롤러 전체는 @ApiExcludeController로 표시하면 검사에서 빠진다.
// 컨트롤러 파서는 route-guards와 같은 것을 쓴다(데코레이터를 변수로 조합하거나 상속한 컨트롤러는 놓칠 수 있다).
// 규칙 상세는 docs/api.md 3.3.
import fs from 'node:fs';
import path from 'node:path';
import { rel, result, walk } from '../lib/util.mjs';
import { parseController } from './route-guards.mjs';

export default {
  id: 'api-docs',
  title: 'API 문서 데코레이터',
  run({ root, config }) {
    const out = result();
    const cfg = config.apiDocs;
    if (!cfg) {
      out.notes.push('apiDocs 설정 없음 — 건너뜀');
      return out;
    }
    const files = walk(path.join(root, cfg.srcRoot), (f) => f.endsWith(cfg.fileSuffix ?? '.controller.ts'));
    if (files.length === 0) {
      out.notes.push(`${cfg.srcRoot}에 컨트롤러가 아직 없다 — 건너뜀`);
      return out;
    }

    const operation = cfg.operationDecorator ?? 'ApiOperation';
    const tags = cfg.tagsDecorator ?? 'ApiTags';
    const excludeEndpoint = cfg.excludeEndpointDecorator ?? 'ApiExcludeEndpoint';
    const excludeController = cfg.excludeControllerDecorator ?? 'ApiExcludeController';

    let total = 0;
    let excluded = 0;
    const taggedChecked = new Set();
    for (const file of files) {
      for (const r of parseController(fs.readFileSync(file, 'utf8'))) {
        total++;
        const where = `${rel(root, file)}:${r.line}`;
        if (r.classDecorators.has(excludeController) || r.decorators.has(excludeEndpoint)) {
          excluded++;
          continue;
        }
        if (!r.decorators.has(operation)) {
          out.errors.push(`${where} [R-DOC-04] ${r.className}.${r.method} (@${r.http}) — @${operation}({ summary })가 없다. 문서에서 뺄 라우트면 @${excludeEndpoint}()를 붙인다 (docs/api.md 3.3)`);
        }
        const classKey = `${file}#${r.className}`;
        if (!taggedChecked.has(classKey)) {
          taggedChecked.add(classKey);
          if (!r.classDecorators.has(tags)) {
            out.errors.push(`${where} [R-DOC-04] ${r.className} — 컨트롤러에 @${tags}('English (한글)')가 없다 (docs/api.md 3.3)`);
          }
        }
      }
    }
    out.notes.push(`컨트롤러 ${taggedChecked.size}개 · 라우트 ${total}개 확인 · 문서 제외 ${excluded}개`);
    return out;
  },
};
