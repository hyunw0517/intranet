# 핵심 모듈과 애드온 (ON/OFF) 상세

> [AGENTS.md](../../AGENTS.md) 10.1의 상세. 요약과 규칙 태그(`[R-ARCH-01]`·`[R-ARCH-02]`)는 AGENTS.md에 있다.
> 2026-11-21 AGENTS.md 크기 한도 때문에 옮겼다(내용 변경 없음).

사이트 운영에 필요한 모듈은 **핵심**, 이후 추가하는 업무 기능은 **애드온**으로 두고 배포 설정으로 켜고 끈다. (2026-11-07 사용자 결정)

## 1. 의존 방향

- 애드온 → 핵심: 허용 (예: 시설 예약이 `FilesService`·알림·감사 로그 서비스를 직접 호출)
- 핵심 → 애드온: 금지. 핵심은 애드온 모듈을 import하지 않는다.
- 애드온 → 애드온: 선언한 경우만 허용 (현재 휴가 옵션 → 결재, 과제 관리 ↔ 결재 연결 모듈). 결재 최종 승인 → 연차 반영은 **문서 유형별 처리기 등록 + 같은 트랜잭션**으로 연결한다([features.md](features.md) 7.4). 결재 본체는 휴가를 import하지 않는다.
- 새 모듈 폴더를 만들면 `harness/harness.config.json` `boundaries`에 핵심·애드온으로 분류해 넣는다(분류는 사용자에게 확인). 빠지면 그 모듈은 의존 방향 검사에서 빠진다.

## 2. 켜고 끄기 (배포 설정)

`backend/.env`의 `ADDONS`(쉼표 목록, 예: `ADDONS=reservations,approvals,leaves`)로 `AppModule`에 애드온 모듈을 등록할지 정한다. 변수가 없거나 비면 **전부 꺼짐**. 관리자 화면 실시간 전환은 하지 않는다. (2026-11-09 사용자 결정)

- 이름 목록·옵션의 본체는 `backend/src/config/addons.config.ts`(`ADDONS`, `parseAddons`), 등록은 `AppModule` imports에 `addonModule('reservations', ReservationsModule)` — `ConditionalModule.registerWhen`(`.env` 로드 후 판단)
- 꺼진 애드온은 모듈이 등록되지 않아 **API 자체가 없다(404)**. 데이터는 지우지 않고 그대로 둔다(다시 켜면 그대로 사용).
- 모르는 이름이거나 옵션의 본체가 꺼져 있으면(결재를 끄고 휴가만 켬) 서버가 **시작 단계에서 오류**를 낸다(`AddonsService` 생성자).
- 프론트는 `GET /common/addons`(USER 이상, 응답 `{ enabled: [...] }`)로 메뉴·페이지·관리자 화면·대시보드 카드를 제어한다. 꺼진 애드온 주소로 직접 들어오면 **일반 404 페이지**.

## 3. 핵심이 애드온 데이터를 확인해야 할 때 (등록 지점)

아직 사용처 없음 - 결재는 핵심 삭제를 막지 않고 조회에서 숨기기로 함([features.md](features.md) 7.5).

핵심이 **등록 지점**(Nest provider 배열)을 열어 두고 애드온이 자기 확인 로직을 등록한다. 꺼진 애드온은 등록되지 않으므로 자동으로 빠진다. 핵심은 애드온 테이블을 직접 조회하지 않는다.

## 4. 허용한 타협

Prisma 스키마는 하나라 애드온 테이블도 항상 만들어지고, 핵심의 enum(`FileTargetType`의 `APPROVAL_DOCUMENT`·`CHAT_MESSAGE`, `AuditTargetType`의 `FACILITY`·`LEAVE` 등)에 애드온 값이 있어도 된다. **코드 의존만 끊는다.**

## 5. 과설계 방지

플러그인 로더처럼 모듈을 동적으로 찾아 불러오는 구조는 만들지 않는다. 등록 여부는 `AppModule`에서 목록으로 결정한다.
