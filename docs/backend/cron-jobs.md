# 정기 작업 (`@Cron`) 목록

> 2026-11-12 작성. 시각·조건은 작성 시점 코드 기준이고, 코드가 바뀌면 코드가 우선이다.
> 새 `@Cron`을 추가하거나 시각을 바꾸면 이 표도 고친다.

## 1. 목록

모두 `timeZone: 'Asia/Seoul'`이다. cron 식은 `@nestjs/schedule` 형식(초 분 시 일 월 요일)이다.

| 이름 (`name`) | 시각 (KST) | cron 식 | 하는 일 | 위치 | 구분 |
|---|---|---|---|---|---|
| `leave-grant-monthly` | 매월 1일 00:00 | `0 0 0 1 * *` | 재직자 전원의 올해(12월이면 다음 해도) 연차 부여 `baseDays` 재계산. 조정값은 건드리지 않음 | [leave-grants.service.ts](../../backend/src/approvals/leaves/leave-grants.service.ts) `monthlyRecalculate` | 애드온 옵션 (`leaves`) |
| `notification-cleanup` | 매일 04:00 | `0 0 4 * * *` | 보관 기간(`NOTIFICATION_RETENTION_DAYS` = 90일)이 지난 알림 물리 삭제 | [notifications.service.ts](../../backend/src/common/notifications.service.ts) `deleteExpired` | 핵심 (`common`) |
| `login-history-cleanup` | 매일 04:30 | `0 30 4 * * *` | 없는 사번의 로그인 실패 기록 중 마지막 실패 후 하루가 지났고 잠금도 끝난 행 삭제 | [login-history.service.ts](../../backend/src/auth/login-history.service.ts) `deleteUnknownEmpNos` | 핵심 (`auth`) |
| `project-task-due-soon` | 매일 09:00 | `0 0 9 * * *` | 내일(KST) 마감인 미완료 과제의 담당자에게 마감 임박 알림. 담당자 부재(참여자에서 빠짐·퇴사·삭제) 과제는 제외 | [project-tasks.service.ts](../../backend/src/projects/tasks/project-tasks.service.ts) `notifyDueSoon` | 애드온 (`projects`) |

- 결과는 각 서비스의 `Logger`로 stdout에 남는다(예: "보관 기간(90일) 지난 알림 N건 삭제"). 로그 수집은 `need_list.md`(비공개) 6장.
- 연차 재계산은 관리자 화면 "지금 재계산"도 같은 서비스(`recalculate`)를 호출한다. 상세는 [leaves.md](leaves.md).

## 2. 한곳에 모으지 않은 이유

- 실행 등록은 [app.module.ts](../../backend/src/app.module.ts)의 `ScheduleModule.forRoot()` 한 줄뿐이고, 각 `@Cron`은 **그 일을 하는 서비스에 둔다**(`@nestjs/schedule` 기본 방식).
- 애드온 구조와 맞다: `leave-grant-monthly`는 휴가 모듈 안에 있어서, 휴가 옵션을 끄면 모듈이 등록되지 않고 이 작업도 함께 빠진다. 별도 `jobs/` 모듈에 모으면 그 모듈이 애드온 서비스를 import해야 해서 "핵심은 애드온을 import하지 않는다"(AGENTS.md 10.1, R-ARCH-01) 규칙에 걸린다.
- 그래서 코드는 흩어 두고, 한눈에 보는 목록은 이 문서로 대신한다.

## 3. 운영 시 주의

- **여러 컨테이너에서 같은 DB를 쓰면 작업이 컨테이너마다 실행된다.** 지금 배포 계획은 인스턴스마다 백엔드 컨테이너 하나 + 자기 DB라 중복 실행이 없다([deploy.md](../design/deploy.md)).
- 위의 세 작업(연차 재계산·알림 정리·로그인 기록 정리)은 같은 조건으로 다시 실행해도 결과가 같다(삭제 조건이 같거나, 재계산이 같은 값으로 upsert). 그래서 중복 실행이나 실행 누락이 생겨도 데이터가 틀어지지 않고, 연차 재계산은 다음 실행에서 맞춰진다.
- **`project-task-due-soon`은 다시 실행하면 알림이 한 번 더 간다**(보낸 기록을 따로 남기지 않음). 컨테이너를 여러 개로 늘리면 이 작업은 한 곳에서만 돌게 해야 한다.
- 서버가 그 시각에 꺼져 있으면 그 회차는 건너뛴다(밀린 실행을 다시 하지 않음).
