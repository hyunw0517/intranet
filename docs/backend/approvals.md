# 전자결재 (애드온 `approvals`) 백엔드 구조

> 규칙(사용자 결정)은 [features.md 7.4~7.5](../design/features.md), 연차 계산은 [leave_calculate_manual.md](../design/leave_calculate_manual.md). 이 문서는 구현 구조(복습용)다.
> 2026-11-10 사용자 설계, Claude 구현. ⭐ 상태 전이·동시 처리는 직접 읽고 한 번 고쳐 보기 대상.

## 1. 파일

```text
src/approvals/
├── approvals.module.ts            # 애드온 모듈 (AppModule: addonModule('approvals', ApprovalsModule)), ApprovalHandlerRegistry export
├── approval-handler.registry.ts   # 문서 유형 → 처리기 등록 지점 + 일반 문서 처리기(GeneralDocumentHandler)
├── approvers.service.ts           # 결재자 조회·검사·스냅샷 (템플릿·문서 공용, 핵심 회원·조직 읽기만)
├── line-managers.*                # 결재라인 관리자 규칙 (위임 권한) + 내 관리 범위
├── approval-lines.*               # 결재라인 템플릿 (공용·부서·개인)
├── approval-documents.*           # 결재 문서: 임시저장·상신·승인·반려·회수·다시 기안·결재자 교체·결재함·첨부
├── approval-notifier.ts           # 알림 규칙 (커밋 후 bestEffort)
├── const/approval.const.ts        # 최대 결재자 수, 결재함 enum, 알림 link
├── dto/
└── util/approval-rules.util.ts    # 순수 규칙 (결재자 검사, 관리 범위 계산, 다음 상태) + spec

prisma/migrations/
├── 20261110161000_approval_line_manager      # ApprovalLineManager + CHECK 3개 + 문서당 PENDING 하나(부분 unique, 아래에서 교체)
├── 20261110162000_audit_approval_line_manager # AuditTargetType.APPROVAL_LINE_MANAGER
└── 20261110200600_approval_parallel_steps     # 병렬 단계: unique (문서|템플릿, 결재자), PENDING 같은 단계 exclusion constraint

src/common/files.service.ts        # duplicateAttachments 추가 (다시 기안 시 첨부 복사)
test/approvals.e2e-spec.ts         # e2e 21개
```

## 2. API

모든 API는 `@Roles(USER)` 이상. 표의 권한은 서비스에서 확인한다.

| 메서드 | 경로 | 권한 | 내용 |
|---|---|---|---|
| ~~GET~~ | ~~`/approvals/approvers?search=`~~ | - | **2026-11-17 삭제**(사용자 결정): 결재자 후보 검색은 핵심의 공용 회원 검색 `GET /users/search`(같은 대상 조건: 재직 승인 회원, 이름·사번·부서명, 최대 20명, 개인정보 제외)를 쓴다. 지정 가능 여부(`usable`)는 프론트가 true로 채운다 |
| GET | `/approvals/line-managers/me` | 전원 | 내 관리 범위 `{ all, departmentIds, departments }` (departments = 관리할 수 있는 부서 이름) |
| GET·POST | `/approvals/line-managers` | ADMIN | 규칙 목록(`inactive`: 판정에서 무시되는 규칙) / 등록 `{ userId? \| jobTitleId?, scope, departmentId? }` |
| DELETE | `/approvals/line-managers/:id` | ADMIN | 해제 (수정 없음) |
| GET | `/approvals/lines` | 전원 | 불러올 수 있는 템플릿 (공용 + 내 부서 + 내 개인), 단계마다 `usable` |
| GET | `/approvals/lines/manage` | 결재라인 관리자 | 관리할 수 있는 공용·부서 템플릿 (없으면 403) |
| POST·PATCH·DELETE | `/approvals/lines(/:id)` | 개인 = 본인 / 공용·부서 = 관리 범위 | 남의 개인 라인은 404 |
| GET | `/approvals/document-types` | 전원 | 등록된 문서 유형 `[{ type, directCreate }]` |
| GET | `/approvals/documents?box=&status=&page=&take=` | 전원 (`all`은 ADMIN) | 결재함 |
| GET | `/approvals/documents/counts` | 전원 | 탭 건수 `{ pending, upcoming, mine, drafts }` - mine은 결재요청·결재중만. 목록과 같은 조건 함수(`boxWhere`)를 쓴다 |
| GET | `/approvals/documents/:id` | 기안자·라인·ADMIN (DRAFT는 기안자) | 상세 + `steps[].approverUsable` + `histories` + `files` + `permissions` |
| POST | `/approvals/documents` | 전원 | 임시저장 생성 |
| PATCH·DELETE | `/approvals/documents/:id` | 기안자, DRAFT | 수정(steps·attachmentIds는 보내면 전체 교체) / soft delete |
| PATCH | `/approvals/documents/:id/submit` | 기안자, DRAFT | 상신 |
| PATCH | `/approvals/documents/:id/cancel` | 기안자, REQUESTED | 회수 |
| PATCH | `/approvals/documents/:id/approve` · `reject` | 내 차례 | `{ comment? }` / `{ comment }` 필수 |
| POST | `/approvals/documents/:id/copy` | 기안자, REJECTED·CANCELLED | 다시 기안 → 새 DRAFT |
| PATCH | `/approvals/documents/:id/steps/:stepId` | ADMIN | 결재자 교체 `{ approverId }` (PENDING·WAITING 결재자 한 명 - 병렬 단계라 단계 행 id) |
| GET | `/approvals/documents/:id/files/:fileId` | 열람 권한 | 첨부 다운로드 |

## 3. 상태 전이와 동시 처리 ⭐

```text
DRAFT ─submit→ REQUESTED ─approve(1단계)→ IN_PROGRESS ─approve(마지막)→ APPROVED
                  ├ cancel(기안자) → CANCELLED
                  └ reject(현재 결재자) ─────────────────────────→ REJECTED
```

- 문서의 `currentStepOrder` = 지금 차례인 단계. 단계 상태는 `WAITING → PENDING → APPROVED/REJECTED`.
- **잠금 순서를 하나로 통일**했다 (`approval-documents.service.ts`):
  1. 문서 행 `updateMany({ where: { id, status: 기대 상태, currentStepOrder: 기대 순서 } })` → 0행이면 409
  2. 단계 행 `updateMany({ where: { id: 단계, approverId: 나, status: PENDING } })` → 0행이면 409 (트랜잭션 전체 롤백)
- 왜 문서 행이 먼저인가: 승인은 단계 → 문서, 회수는 문서 → 단계 순서로 잠그면 두 트랜잭션이 서로의 행을 기다리는 교착(deadlock)이 생긴다. 모두 문서 행부터 잠그면 뒤에 온 쪽은 앞 트랜잭션이 끝날 때까지 기다린 뒤, 바뀐 상태로 WHERE를 다시 평가해 0행이 된다(PostgreSQL READ COMMITTED).
- 결재자 교체도 문서 행을 먼저 잠근다(값 변경 없이 `updatedId`만). 교체와 그 단계의 승인이 겹치면 한쪽만 성공한다.
- **병렬 단계**(같은 `stepOrder` = 한 단계, 모두 승인): 승인은 ① 문서 행 잠금(`currentStepOrder` 조건) → ② 내 행 APPROVED → ③ 잠근 뒤 "같은 단계에서 아직 승인 안 한 인원"을 세어 0이면 다음 단계를 연다. 같은 단계 두 명이 동시에 승인해도 ①에서 줄을 서므로 마지막 사람만 다음 단계를 연다(e2e 5회 반복). 반려는 같은 단계의 남은 PENDING을 WAITING으로.
- 최종 방어선: exclusion constraint `approval_document_step_pending_same_step` (같은 문서의 PENDING 행은 모두 같은 단계 번호).
- 이미 처리한 결재를 다시 누른 요청(앞 요청이 이미 커밋된 뒤 도착)은 트랜잭션 전 확인에서 409 "이미 처리한 결재입니다."
- 회수·반려 시 남은 PENDING 단계는 WAITING으로 되돌려 결재 대기함에서 빠지게 한다.

## 4. 결재라인과 관리자 위임

- 문서 단계는 기안자가 자유 지정(템플릿은 불러오기용, `approvalLineTemplateId`는 기록만). 임시저장 때도 단계를 `ApprovalDocumentStep`에 저장하고, **상신 시 잠근 뒤 다시 검사하고 스냅샷을 다시 채운다**(임시저장 뒤 결재자가 퇴사했을 수 있음).
- 문서 단계에는 단계명 컬럼이 없다(템플릿 단계명은 문서로 복사되지 않음).
- 결재라인 관리자 판정(`LineManagersService.manageScope`): ADMIN → 전체. 그 외에는 내 회원 규칙 + 내가 가진 직책 규칙을 모아 `resolveManageScope`(순수 함수)로 계산하고, `withDescendants`(순수 함수)로 **하위 부서 전체**를 더한다(기술본부 관리자 → 개발1팀 등). `myScope`는 이 범위의 부서를 트리 순서 + 경로(`path`)로 준다(화면 선택지). 삭제된 부서·직책 규칙은 쿼리에서 거른다. 요청마다 DB로 판정 → 즉시 반영.

## 5. 업무 처리기 (휴가 연결)

- `ApprovalHandlerRegistry.register({ type, directCreate, onSubmit?, onFinalApproved?, onCopy? })` - 업무 모듈이 `onModuleInit`에서 등록한다.
- `onSubmit`은 상신 트랜잭션 안(휴가: 하루 합계·잔여 확인), `onFinalApproved`는 최종 승인 트랜잭션 안(휴가: 같은 확인 한 번 더), `onCopy`는 다시 기안 트랜잭션 안(휴가: 휴가 항목 복사)에서 같은 `tx`로 호출된다. 예외를 던지면 상신·승인 전체가 롤백된다.
- `directCreate: false`인 유형(휴가)은 결재 문서 API로 만들거나 수정할 수 없다(자기 업무 API에서). 다시 기안은 `onCopy`가 있으면 결재 문서 API로 된다.
- 업무 API가 문서와 업무 데이터를 한 트랜잭션에 저장하도록 `createWithData` / `updateWithData`(마지막 인자 `DraftDataWriter(tx, documentId)`)와 열람 확인 `assertVisible`을 공개한다(`ApprovalsModule`이 `ApprovalDocumentsService`를 export). 결재 본체는 업무 데이터가 무엇인지 모른다.
- 등록되지 않은 유형(옵션이 꺼짐)은 생성·상신·승인 모두 400.
- 휴가 쪽 구현은 [leaves.md](leaves.md).

## 6. 알림·감사 로그·이력

- 알림(커밋 후, `ApprovalNotifier`): 상신·중간 승인 → 다음 결재자 `APPROVAL_REQUESTED`, 최종 승인 → 기안자 `APPROVAL_APPROVED`, 반려 → 기안자 `APPROVAL_REJECTED`(내용에 의견), 관리자 교체로 새 결재자가 PENDING → `APPROVAL_REQUESTED`. link `/approvals/:id`.
- 업무 이력(`ApprovalDocumentHistory`): 생성(null → DRAFT), 상신, 승인마다(중간 승인은 IN_PROGRESS → IN_PROGRESS), 반려, 회수, 결재자 교체(같은 상태 + 변경 내용).
- 감사 로그: 문서 생성·수정·삭제·다시 기안·상태 변경(`STATUS_CHANGE`)·결재자 교체, 템플릿 CRUD(`APPROVAL_LINE`), 관리자 규칙(`APPROVAL_LINE_MANAGER`).

## 7. 테스트

- 단위 `src/approvals/util/approval-rules.util.spec.ts` 18개: 결재자 검사, 병렬 단계 펼치기·묶기·검사, 관리 범위(ALL/DEPARTMENT/MY_DEPARTMENT), 관리 가능 여부, 다음 상태.
- e2e `test/approvals.e2e-spec.ts` 28개: 템플릿 권한(개인 404·공용 403·직책 위임·즉시 해제), CHECK 제약, 임시저장·상신·스냅샷·결재함·알림, 순차 승인, 중간 반려, 다시 기안(첨부 복사 포함), 회수, ⭐ 동시 승인 5건 → 1건, ⭐ 회수와 승인 동시 × 5회 → 한쪽만, PENDING exclusion constraint, 열람, 퇴사 결재자 교체(단계 행 id), 첨부 다운로드, 결재자 검색, 탭 건수, 병렬 단계 5개(빈 단계 400, 한 명 승인 시 단계 유지·회수 불가, 한 명 반려 시 문서 반려, ⭐ 같은 단계 두 명 동시 승인 × 5회 → 다음 단계 한 번, 템플릿 단계 묶음).
- `.env.test`의 `ADDONS=reservations,approvals,leaves`(휴가가 켜져 있으면 문서 유형에 `LEAVE`도 나오므로 문서 유형 테스트는 첫 항목 `GENERAL`만 확인).

## 8. 남은 것

- 프론트 (결재함·작성·상세·결재라인 관리·관리자 규칙 화면)
- ~~휴가 옵션(`approvals/leaves/`)~~ → 백엔드 완료 2026-11-12, [leaves.md](leaves.md). 화면은 남음
- ~~개발 `.env`의 `ADDONS`에 `approvals`~~ → 2026-11-12 사용자가 `reservations,approvals,leaves`로 설정.
