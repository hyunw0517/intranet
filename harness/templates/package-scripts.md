# 패키지에 추가할 검증 스크립트

`node harness/verify.mjs`는 `backend/`, `frontend/`의 `package.json`에서 아래 이름의 스크립트를 찾아 실행한다. 없으면 경고만 내고 건너뛴다.

핵심은 **검사 전용(`lint:check`)과 자동 수정(`lint`)을 나누는 것**이다. 검증하려고 돌린 명령이 파일을 고치면, 에이전트는 무엇이 고쳐졌는지 모른 채 "통과"를 보고하게 된다.

## backend (NestJS)

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint \"{src,test}/**/*.ts\" --fix",
    "lint:check": "eslint \"{src,test}/**/*.ts\" --max-warnings=0",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "test:e2e": "node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json"
  }
}
```

## frontend (Next.js)

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint --fix",
    "lint:check": "eslint --max-warnings=0"
  }
}
```

## 어떤 상황에 무엇이 도나

| 상황 | 실행 |
|---|---|
| 세션 시작 (SessionStart hook) | 하네스 검사만 (`--quick`) |
| Claude가 응답을 끝낼 때 (Stop hook) | 하네스 검사 + 바뀐 패키지의 `typecheck`, `lint:check` |
| 커밋 (pre-commit) | 하네스 검사 + 바뀐 패키지의 `typecheck`, `lint:check` |
| 직접 실행 `node harness/verify.mjs` | 전부 (`test` 포함) |

e2e 테스트는 DB가 필요하고 느리므로 자동 실행에 넣지 않았다. 기능을 마칠 때 직접 돌린다.
