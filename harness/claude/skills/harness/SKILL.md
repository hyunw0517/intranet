---
name: harness
description: 이 저장소의 하네스(규칙 대장, 검사, hook)를 점검·확장하는 절차. "하네스 점검해줘", "규칙 추가해줘", "이 실수 다시 안 나게 해줘", "hook이 잘못 막아", "문서가 코드랑 안 맞아", "문서 정리해줘"처럼 규칙·검증·문서 드리프트를 다룰 때 쓴다. 같은 실수가 두 번 나왔을 때도 쓴다.
---

# harness — 하네스 점검과 확장

설계 배경은 `docs/harness.md`. 이 skill은 절차만 다룬다.

## 모드

| 요청 | 모드 |
|---|---|
| "하네스 점검", "상태 어때" | 점검 |
| "규칙 추가", "이 실수 다시 안 나게" | 규칙 추가 |
| "hook이 잘못 막아", "검사가 틀렸어" | 규칙 조정 |
| "문서 정리", "문서가 코드랑 달라" | 문서 정리 |
| "템플릿에 반영", "하네스 배운 것 정리" | 템플릿 반영 |

## 점검

1. `node harness/verify.mjs --quick` 실행, 그 다음 하네스 자체 테스트 `node --test harness/tests/` (이 저장소는 루트 package.json이 없어 `npm run harness:test`를 쓸 수 없다).
2. 보고:
   - 오류·경고 목록과 원인
   - 판단에만 맡긴 규칙(manual) 목록과 각 reason. 이 중 **지금은 자동화할 수 있게 된 것**이 있는지(예: 테스트할 코드가 생김)
   - 경고로 남은 "파일이 아직 없다"(예: roles-coverage e2e) — 코드가 생겼으면 템플릿 복사를 제안
3. 고치지 않고 보고만 한다. 사용자가 고르면 해당 모드로 진행한다.

## 규칙 추가

1. **규칙 문장 정하기**: 한 줄, 검사 가능한 형태로. "조심한다"가 아니라 "X는 Y를 import하지 않는다". 업무 규칙이면 사용자에게 문장을 확인받는다 [R-PROC-01].
2. **id 정하기**: `R-<영역>-<두 자리>`. 영역은 기존 것(AUTH, ARCH, DOC, SEC, DB, GIT, VER, PROC)을 우선 쓴다. `harness/rules.json`에서 다음 번호를 확인한다.
3. **강제 수단 고르기** (위에서부터 가능한 것):
   - check — 파일만 보고 판정 가능. 기존 검사의 설정(`harness/harness.config.json`)으로 되면 설정만 추가. 아니면 `harness/checks/<id>.mjs`를 새로 만들고 `harness/verify.mjs`의 `CHECKS`에 등록.
   - hook — 행동을 막아야 함. `guards.protectedFiles` / `immutableIfExists` / `bash`에 패턴 추가. deny는 되돌릴 수 없는 것만, 나머지는 ask.
   - test — 실행해야 앎. 테스트 파일 경로를 enforcedBy에 적는다.
   - manual — reason 필수.
4. **세 곳에 반영**: AGENTS.md(또는 docs/design/) 해당 장에 `[R-...]` 태그와 함께 한 줄, `harness/rules.json`, `docs/design/changelog.md`.
5. **테스트**: 새 검사·패턴은 `harness/tests/`에 통과 사례와 실패 사례를 하나씩 추가한다. 특히 hook 패턴은 **정상 명령을 막지 않는지**도 확인한다.
6. `node harness/verify.mjs --quick`과 `node --test harness/tests/` 통과 확인.
7. AGENTS.md가 경고선(`harness.config.json` `agentsSize`)을 넘으면 상세를 docs/로 옮긴다.

## 규칙 조정 (잘못 막을 때)

1. 무엇이 왜 막혔는지 재현한다(`decideBash` / `decideEdit` / 해당 검사의 테스트에 사례 추가).
2. 규칙이 너무 넓은가(패턴 수정), 예외가 정당한가(allowlist에 **이유와 함께** 추가) 판단해 사용자에게 제안한다.
3. 예외를 늘리기 전에 규칙 자체가 맞는지 먼저 본다. 예외가 3개를 넘으면 규칙을 다시 쓴다.
4. 승인 후 수정 → 테스트 → changelog.

## 문서 정리

1. `node harness/verify.mjs --only=doc-paths,doc-links`로 깨진 경로·링크를 찾는다.
2. 각 항목을 코드와 대조한다: 이름이 바뀌었나(문서 수정), 지웠나(문서에서 삭제), 아직 안 만들었나("(예정)" 표시).
3. AGENTS.md에서 요약이 아닌 상세(긴 설명, 코드 예시)를 찾아 docs/design/으로 옮길 후보를 제안한다.
4. 설계 내용 자체를 바꾸는 수정은 사용자 확인 후에 한다. 경로·링크 수정은 바로 해도 된다.

## 템플릿 반영

이 프로젝트에서 배운 것을 범용 템플릿(D:\VScode_Workspace\harness-starter)에 되돌린다. 원칙은 템플릿 쪽 docs/harness.md 8장.

1. `docs/devlog/`에서 **(하네스 개선)** 항목과 `git log -- harness/`를 모은다.
2. 항목마다 분류해 사용자에게 보여 준다: 템플릿에 반영(일반화 가능) / 예시로만 남김(프로젝트 전용 설정) / 버림.
3. 사용자가 고른 것만 템플릿 폴더에 반영한다. 프로젝트 모듈 이름·업무 규칙은 템플릿 코드에 넣지 않고 `harness/examples/<프로젝트>.config.json`으로 남긴다.
4. 템플릿에서 `npm run harness:test`와 `node harness/verify.mjs --quick`이 통과하는지 확인한다. 검사·패턴을 바꿨으면 테스트를 같이 추가한다.
5. 템플릿 `harness/CHANGELOG.md`에 새 버전을 쓴다: 무엇을 바꿨나 + 어느 프로젝트에서 무엇을 배웠나.
6. 템플릿 폴더에 접근할 수 없으면 바꿀 내용을 정리해 보고만 한다.

## 하지 않는 것

- 검사를 통과시키려고 검사나 규칙을 약하게 만들지 않는다. 그게 필요해 보이면 사용자에게 묻는다.
- hook을 끄거나 `--no-verify`를 제안하지 않는다 [R-GIT-01].
