@AGENTS.md

# Claude Code 전용

> 공통 설계·규칙은 위에서 불러온 [AGENTS.md](AGENTS.md)가 원본이다. 이 파일에는 Claude Code에만 해당하는 내용만 둔다.
> 설계가 바뀌면 이 파일이 아니라 AGENTS.md(또는 `docs/design/`)를 고친다.

## Skill

| 작업 | skill | 위치 |
|---|---|---|
| 세션 기록을 `docs/devlog/`(주 단위 파일)에 남기기, 커밋 후 해시 채우기 | `/devlog` | 원본 `harness/claude/skills/devlog/SKILL.md` |
| 면접 Q&A를 Notion DB에 등록 | `/interview-qa` | `.claude/skills/interview-qa/SKILL.md` (비공개, 원본 없음) |
| 하네스 점검, 규칙 추가·조정, 템플릿 반영 | `/harness` | 원본 `harness/claude/skills/harness/SKILL.md` |

- Notion 주소 표(페이지·DB URL, data source)와 면접 Q&A DB의 속성·본문 형식은 `interview-qa` skill에 있다. 검색하지 말고 그 표의 주소로 바로 접근한다.
- 문서화 흐름(devlog → Notion)과 트러블슈팅 후보 표는 `docs/portfolio.md`(비공개)를 따른다. 절차 형식을 바꿀 때는 skill 파일을 고친다.

## Hook (원본 `harness/claude/settings.json`, 설치: `node harness/install-claude.mjs`)

| 시점 | 하는 일 |
|---|---|
| 세션 시작 | Plan.md "처리할 작업"·마지막 devlog·최근 커밋·하네스 상태를 맥락에 넣는다 |
| 파일 수정·명령 실행 전 | AGENTS.md 18.1의 위험한 파일·명령을 막거나 묻는다 |
| 응답 끝낼 때 | 바뀐 패키지 검증. 실패하면 끝내지 못한다 |

hook·skill을 고칠 때는 `harness/claude/`를 고치고 사용자에게 재설치(`--force`)를 부탁한다. 에이전트는 .claude 폴더에 직접 쓰지 않는다.
