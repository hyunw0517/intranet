import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ROOT } from '../lib/util.mjs';
import { ctx, makeRepo } from './helpers.mjs';

const EXAMPLE = JSON.parse(fs.readFileSync(path.join(DEFAULT_ROOT, 'harness/examples/intranet.config.json'), 'utf8'));
import importBoundaries, { extractImports } from '../checks/import-boundaries.mjs';
import routeGuards, { maskStrings, parseController } from '../checks/route-guards.mjs';
import apiDocs from '../checks/api-docs.mjs';
import rulesRegistry from '../checks/rules-registry.mjs';
import docLinks from '../checks/doc-links.mjs';
import docPaths from '../checks/doc-paths.mjs';
import agentsSize from '../checks/agents-size.mjs';

// ── import-boundaries ─────────────────────────────────────────

test('import-boundaries: 핵심 → 애드온 import는 상대 경로·src/ 경로 모두 잡는다', () => {
  const root = makeRepo({
    'backend/src/boards/boards.service.ts': `import { X } from '../reservations/reservations.service';\nimport {\n  Y,\n} from 'src/approvals/approvals.service';\n`,
    'backend/src/reservations/reservations.service.ts': 'export class X {}',
    'backend/src/approvals/approvals.service.ts': 'export class Y {}',
  }, { config: EXAMPLE });
  const r = importBoundaries.run(ctx(root));
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /boards\.service\.ts:1 \[R-ARCH-01\] boards → reservations/);
  assert.match(r.errors[1], /boards\.service\.ts:4 \[R-ARCH-01\] boards → approvals/);
});

test('import-boundaries: 애드온 → 핵심, 같은 모듈 안, 외부 패키지, 테스트 파일은 허용', () => {
  const root = makeRepo({
    'backend/src/reservations/reservations.service.ts': `import { Injectable } from '@nestjs/common';\nimport { FilesService } from 'src/common/files/files.service';\nimport { util } from './util/rules';\n`,
    'backend/src/common/files/files.service.ts': 'export class FilesService {}',
    'backend/src/common/x.spec.ts': `import { A } from '../approvals/a';`,
    'backend/src/app.module.ts': `import { ReservationsModule } from './reservations/reservations.module';`,
  }, { config: EXAMPLE });
  assert.deepEqual(importBoundaries.run(ctx(root)).errors, []);
});

test('import-boundaries: common → 업무 모듈 금지, 주석 속 import는 무시', () => {
  const root = makeRepo({
    'backend/src/common/notifications/notify.ts': `// import { U } from '../../users/users.service';\nimport { U } from '../../users/users.service';`,
    'backend/src/common/files.controller.ts': `import { Roles } from 'src/auth/decorator/roles.decorator';`,
  }, { config: EXAMPLE });
  const r = importBoundaries.run(ctx(root));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /notify\.ts:2 \[R-ARCH-01\] common → users/); // common → auth는 허용
});

test('import-boundaries: 소스가 없으면 건너뛴다', () => {
  const r = importBoundaries.run(ctx(makeRepo({}, { config: EXAMPLE })));
  assert.deepEqual(r.errors, []);
  assert.match(r.notes[0], /건너뜀/);
});

test('import-boundaries: 경계를 선언하지 않은 템플릿 상태는 경고', () => {
  const r = importBoundaries.run(ctx(makeRepo()));
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings[0], /선언되지 않았다/);
});

test('import-boundaries: "*" 규칙 — 프론트 기능 폴더끼리 import 금지, 별칭 경로 포함', () => {
  const root = makeRepo({
    'frontend/src/features/board/hooks/use-posts.ts': `import { a } from '@/features/auth/safe-redirect';\nimport { b } from './query-keys';`,
    'frontend/src/features/auth/x.tsx': `import { api } from '../../services/api/auth';`,
  }, { config: { ...EXAMPLE, boundaries: EXAMPLE.$candidateBoundaries } });
  const r = importBoundaries.run(ctx(root));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /use-posts\.ts:1 \[R-ARCH-01\] board → auth/);
});

// R-ARCH-02 (v0.4): 경계 설정에 없는 새 모듈은 아무 규칙에도 걸리지 않아 조용히 통과한다 → requireClassified로 잡는다
const classified = ( extra = {} ) => ({
  ...EXAMPLE,
  boundaries: [ { ...EXAMPLE.boundaries[0], requireClassified: true, unrestricted: [], ...extra } ],
});

test('import-boundaries: requireClassified — 규칙에 없는 새 모듈은 오류 (그 모듈의 import가 검사 대상에서 빠지므로)', () => {
  const root = makeRepo({
    'backend/src/boards/boards.service.ts': `import { P } from '../payroll/payroll.service';`,
    'backend/src/payroll/payroll.service.ts': 'export class P {}',
  }, { config: classified() });
  const r = importBoundaries.run(ctx(root));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /backend\/src\/payroll \[R-ARCH-02\] 경계 설정에 없는 모듈/);
});

test('import-boundaries: requireClassified — unrestricted에 등록한 모듈과 규칙에 있는 모듈은 통과', () => {
  const root = makeRepo({
    'backend/src/generated/client.ts': 'export const c = 1;',
    'backend/src/boards/boards.service.ts': `import { c } from '../generated/client';`,
  }, { config: classified({ unrestricted: [ { module: 'generated', reason: 'Prisma 생성 코드' } ] }) });
  assert.deepEqual(importBoundaries.run(ctx(root)).errors, []);
});

test('import-boundaries: requireClassified를 켜지 않으면 확인하지 않는다 (기존 동작 유지)', () => {
  const root = makeRepo({ 'backend/src/payroll/payroll.service.ts': 'export class P {}' }, { config: { ...EXAMPLE, boundaries: [ { ...EXAMPLE.boundaries[0], requireClassified: false } ] } });
  assert.deepEqual(importBoundaries.run(ctx(root)).errors, []);
});

test('extractImports: export from, 동적 import, require', () => {
  const specs = extractImports(`export * from './a';\nconst b = await import('./b');\nconst c = require("./c");\nimport './d';`).map((i) => i.spec);
  assert.deepEqual(specs, ['./a', './b', './c', './d']);
});

// ── route-guards ──────────────────────────────────────────────

const CONTROLLER = `
import { Controller, Get, Post, Body, Param } from '@nestjs/common';

@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
  ) {}

  @Get()
  @Roles(UserRole.USER)
  findAll() {
    return this.posts.findAll();
  }

  @Post(':id')
  async create(
    @Param('id') id: number,
    @Body() dto: CreatePostDto,
  ) {
    return this.posts.create(id, dto);
  }

  @Roles(
    UserRole.ADMIN,
  )
  @Get('admin')
  adminOnly() {}

  @IsPublic() @Get('health') health() {}

  private helper() {}
}
`;

test('parseController: 여러 줄 매개변수·여러 줄 데코레이터·한 줄 데코레이터를 구분한다', () => {
  const routes = parseController(CONTROLLER);
  assert.deepEqual(
    routes.map((r) => [r.method, r.http, [...r.decorators].sort().join(',')]),
    [
      ['findAll', 'Get', 'Get,Roles'],
      ['create', 'Post', 'Post'],
      ['adminOnly', 'Get', 'Get,Roles'],
      ['health', 'Get', 'Get,IsPublic'],
    ],
  );
});

test('route-guards: 권한 데코레이터 없는 라우트만 오류', () => {
  const root = makeRepo({ 'backend/src/boards/posts.controller.ts': CONTROLLER });
  const r = routeGuards.run(ctx(root));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /posts\.controller\.ts:17 \[R-AUTH-01\] PostsController\.create \(@Post\)/);
});

test('route-guards: 클래스에 붙은 @Roles는 모든 메서드에 적용된다', () => {
  const root = makeRepo({
    'backend/src/admin/admin.controller.ts': `@Roles(UserRole.ADMIN)\n@Controller('admin')\nexport class AdminController {\n  @Get()\n  list() {}\n}\n`,
  });
  assert.deepEqual(routeGuards.run(ctx(root)).errors, []);
});

test('route-guards: allowlist는 통과, 없어진 allowlist 항목은 경고', () => {
  const root = makeRepo({
    'backend/src/users/users.controller.ts': `@Controller('users')\nexport class UsersController {\n  @Get('me')\n  getMe() {}\n}\n`,
  });
  const c = ctx(root);
  c.config.routeGuards.allowlist.push({ route: 'UsersController.getMe', reason: '본인' }, { route: 'UsersController.removed', reason: 'x' });
  const r = routeGuards.run(c);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /UsersController\.removed/);
});

test('parseController: 문자열 안의 괄호·"//"는 데코레이터 범위와 주석 제거에 영향을 주지 않는다', () => {
  // Swagger 설명의 "[start, end)" 때문에 뒤의 라우트를 놓치던 문제 (2026-11-22)
  const src = [
    "@Controller('r')",
    'export class RController {',
    "  @Get('a')",
    "  @ApiOperation({ summary: '기간', description: '범위는 [from, to) 최대 31일' })",
    '  a() {}',
    "  @Get('b')",
    "  @ApiOperation({ summary: '링크', description: 'http://example.com 참고' })",
    "  @Roles(UserRole.USER)",
    '  b() {}',
    '}',
  ].join('\n');
  assert.deepEqual(parseController(src).map((r) => [r.method, [...r.decorators].sort().join(',')]), [
    ['a', 'ApiOperation,Get'],
    ['b', 'ApiOperation,Get,Roles'],
  ]);
  assert.equal(maskStrings("x('a)b') // c"), "x('   ') // c");
});

// ── api-docs ──────────────────────────────────────────────────

test('api-docs: @ApiOperation 없는 라우트, @ApiTags 없는 컨트롤러는 오류', () => {
  const root = makeRepo({
    'backend/src/boards/posts.controller.ts': `@Controller('posts')
export class PostsController {
  @Get()
  @ApiOperation({ summary: '목록' })
  list() {}

  @Post()
  create() {}
}
`,
  });
  const r = apiDocs.run(ctx(root));
  assert.equal(r.errors.length, 2);
  assert.match(r.errors.join('\n'), /\[R-DOC-04\] PostsController\.create \(@Post\) — @ApiOperation/);
  assert.match(r.errors.join('\n'), /\[R-DOC-04\] PostsController — 컨트롤러에 @ApiTags/);
});

test('api-docs: 다 붙어 있으면 통과, @ApiExcludeEndpoint·@ApiExcludeController는 검사에서 뺀다', () => {
  const root = makeRepo({
    'backend/src/boards/posts.controller.ts': `@ApiTags('Posts (게시글)')
@Controller('posts')
export class PostsController {
  @Get()
  @ApiOperation({ summary: '목록' })
  list() {}

  @Get('health')
  @ApiExcludeEndpoint()
  health() {}
}
`,
    'backend/src/app.controller.ts': `@ApiExcludeController()
@Controller()
export class AppController {
  @Get()
  hello() {}
}
`,
  });
  const r = apiDocs.run(ctx(root));
  assert.deepEqual(r.errors, []);
  assert.match(r.notes[0], /라우트 3개 확인 · 문서 제외 2개/);
});

test('api-docs: 설정이 없으면 건너뛴다', () => {
  const root = makeRepo({});
  const c = ctx(root);
  delete c.config.apiDocs;
  assert.match(apiDocs.run(c).notes[0], /apiDocs 설정 없음/);
});

// ── rules-registry ────────────────────────────────────────────

const RULES = [
  { id: 'R-AUTH-01', title: 'a', enforcedBy: [{ type: 'check', id: 'route-guards' }] },
  { id: 'R-PROC-01', title: 'b', enforcedBy: [{ type: 'manual', reason: '판단 필요' }] },
  { id: 'R-DB-01', title: 'c', enforcedBy: [{ type: 'test', path: 'backend/test/x.e2e-spec.ts' }] },
];

test('rules-registry: 태그와 대장이 맞으면 통과, manual 수를 보고, 없는 테스트 파일은 경고', () => {
  const root = makeRepo({ 'AGENTS.md': '- [R-AUTH-01] a\n- [R-PROC-01] b\n- [R-DB-01] c\n' }, { rules: RULES });
  const r = rulesRegistry.run(ctx(root));
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.notes[0], /규칙 3개 · 자동 강제 2개 · 판단에만 맡긴 규칙 1개/);
});

test('rules-registry: 대장에 없는 태그, 문서에 없는 규칙, 없는 검사 id, reason 없는 manual', () => {
  const rules = [
    { id: 'R-AUTH-01', title: 'a', enforcedBy: [{ type: 'check', id: 'no-such-check' }] },
    { id: 'R-PROC-01', title: 'b', enforcedBy: [{ type: 'manual' }] },
  ];
  const root = makeRepo({ 'AGENTS.md': '- [R-AUTH-01] a\n- [R-XYZ-99] 등록 안 됨\n```\n[R-IGN-01] 코드 블록은 무시\n```\n' }, { rules });
  const errors = rulesRegistry.run(ctx(root)).errors.join('\n');
  assert.match(errors, /대장에 없는 규칙 R-XYZ-99/);
  assert.doesNotMatch(errors, /R-IGN-01/);
  assert.match(errors, /R-PROC-01 "b"이\(가\) 어떤 문서에도 없다/);
  assert.match(errors, /없는 검사 id "no-such-check"/);
  assert.match(errors, /manual에는 reason/);
});

// ── doc-links / doc-paths / agents-size ───────────────────────

test('doc-links: 깨진 상대 링크만 잡고, 외부 링크·앵커·코드 블록은 무시', () => {
  const root = makeRepo({
    'AGENTS.md': '[ok](docs/a.md#x) [bad](docs/none.md) [web](https://x.com) [anchor](#top)\n```\n[in code](nope.md)\n```\n',
    'docs/a.md': '[up](../AGENTS.md)',
  });
  const r = docLinks.run(ctx(root));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /AGENTS\.md:1 깨진 링크 → docs\/none\.md/);
});

test('doc-paths: 없는 경로는 오류, (예정)은 경고, 패턴·코드 블록은 무시', () => {
  const root = makeRepo({
    'AGENTS.md': [
      '`docs/a.md` 있음',
      '`backend/src/gone.ts` 없음',
      '`backend/src/later.ts` 만들 예정 (예정)',
      '`backend/src/*.ts` 패턴, `backend/<module>/` 자리표시자',
      '```',
      '`backend/in-code.ts`',
      '```',
    ].join('\n'),
    'docs/a.md': 'x',
  });
  const r = docPaths.run(ctx(root));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /AGENTS\.md:2 .*backend\/src\/gone\.ts/);
  assert.equal(r.warnings.length, 1);
});

test('agents-size: 한도 초과는 오류, 경고선 초과는 경고', () => {
  const root = makeRepo({ 'AGENTS.md': 'x'.repeat(200), 'CLAUDE.md': 'y'.repeat(50) });
  const c = ctx(root);
  c.config.agentsSize = { 'AGENTS.md': { maxBytes: 100 }, 'CLAUDE.md': { maxBytes: 100, warnBytes: 40 } };
  const r = agentsSize.run(c);
  assert.equal(r.errors.length, 1);
  assert.equal(r.warnings.length, 1);
});

test('doc-paths: 확장자나 끝 /가 없는 토큰(브랜치 이름)은 건너뛰고, 표 머리글·절 제목의 "예정"은 경고', () => {
  const root = makeRepo({
    'docs/a.md': [
      '브랜치 `backend/audit`에서 작업',
      '## 코드 위치',
      '| 역할 | 위치(예정) |',
      '|---|---|',
      '| 계산 | `backend/src/leaves/calc.ts` |',
      '',
      '## 다음 (예정)',
      '- `frontend/src/new-page.tsx`',
      '## 현재',
      '- `backend/src/gone/` 폴더',
    ].join('\n'),
  });
  const r = docPaths.run(ctx(root));
  assert.equal(r.warnings.length, 2);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /backend\/src\/gone\//);
});

test('docs.exclude: 이력 문서는 검사하지 않는다', () => {
  const root = makeRepo({ 'docs/devlog.md': '`backend/src/old.ts` 예전 파일', 'docs/b.md': 'x' });
  const c = ctx(root);
  c.config.docs = { ...c.config.docs, exclude: ['docs/devlog.md'] };
  assert.deepEqual(docPaths.run(c).errors, []);
});

test('docs.exclude: "/"로 끝나면 폴더 전체를 뺀다', () => {
  const root = makeRepo({ 'docs/devlog/2026-11-16.md': '`backend/src/old.ts` 예전 파일', 'docs/devlogx.md': '`backend/src/old2.ts`' });
  const c = ctx(root);
  c.config.docs = { ...c.config.docs, exclude: ['docs/devlog/'] };
  const errors = docPaths.run(c).errors;
  assert.equal(errors.length, 1);
  assert.match(errors[0], /old2\.ts/);
});
