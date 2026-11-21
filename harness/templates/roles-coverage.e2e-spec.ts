// [R-AUTH-01] 런타임 검사 템플릿 — backend/test/roles-coverage.e2e-spec.ts로 복사해서 쓴다.
//
// 정적 검사(harness/checks/route-guards.mjs)는 소스 줄을 읽으므로 상속·데코레이터 조합을 놓칠 수 있다.
// 이 테스트는 실제로 등록된 라우트를 Nest에게 물어보므로 "꺼진 애드온은 빠지고, 켜진 것만" 정확히 본다.
// 복사한 뒤 바꿀 곳: ROLES_KEY / IS_PUBLIC_KEY import 경로, 앱 생성 방식(createTestApp 등).
import { Test } from '@nestjs/testing';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from 'src/app.module';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator'; // ← 프로젝트 경로에 맞게
import { IS_PUBLIC_KEY } from 'src/common/decorators/is-public.decorator'; // ← 프로젝트 경로에 맞게

// 예외 목록은 정적 검사와 같은 곳(harness.config.json)에서 읽는다 → 두 검사가 어긋나지 않는다
const config = JSON.parse(readFileSync(join(__dirname, '../../harness/harness.config.json'), 'utf8'));
const allowlist = new Set<string>(config.routeGuards.allowlist.map((a: { route: string }) => a.route));

describe('[R-AUTH-01] 라우트 권한 데코레이터', () => {
  it('등록된 모든 라우트에 @Roles 또는 @IsPublic이 있다 (예외 목록 제외)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
    const discovery = moduleRef.get(DiscoveryService);
    const scanner = moduleRef.get(MetadataScanner);
    const reflector = moduleRef.get(Reflector);

    const missing: string[] = [];
    for (const { instance, metatype } of discovery.getControllers()) {
      if (!instance || !metatype) continue;
      const proto = Object.getPrototypeOf(instance);
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = proto[name];
        if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue; // 라우트가 아닌 메서드
        const targets = [handler, metatype as Function];
        const guarded =
          reflector.getAllAndOverride(ROLES_KEY, targets) !== undefined ||
          reflector.getAllAndOverride(IS_PUBLIC_KEY, targets) !== undefined;
        const key = `${metatype.name}.${name}`;
        if (!guarded && !allowlist.has(key)) missing.push(key);
      }
    }

    await moduleRef.close();
    expect(missing).toEqual([]);
  });
});
