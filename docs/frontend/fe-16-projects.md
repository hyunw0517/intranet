# FE-16 과제 관리 (애드온 `projects`)

> 2026-11-17 · 백엔드 규칙·API는 [docs/design/projects.md](../design/projects.md) 5장. 이 문서는 화면 구조와 흐름만 다룬다.
> 결정(사용자, 2026-11-17): 메뉴 하나 + 하위 탭 3개(프로젝트 / 내 할 일 / 거래처), 상세는 탭(칸반 / 개요 / 참여자), 대시보드 "내 할 일" 카드는 나중에, 참여자 검색용 공용 회원 검색 API는 핵심(`users`)에 추가.

## 1. 경로

| 경로 | 화면 | 접근 |
|---|---|---|
| `/projects` | 프로젝트 목록 (상태 탭, 검색, "내 프로젝트 / 전체 프로젝트" - 전체는 누구나(11/17), 들어갈 수 없는 행(`canOpen` false)은 이름에 링크 없음, 참여 중 표시) | USER (`AddonGate projects`) |
| `/projects/[id]` | 상세: 칸반 / 개요 / 참여자. `?task=:id`면 그 과제 창을 연다(알림 주소) | 참여자·과제 관리 관리자 (서버 403) |
| `/projects/my-tasks` | 내 할 일 (내가 담당인 미완료 과제) | USER |
| `/projects/clients` | 거래처 / 삭제된 거래처 | USER |
| `/admin/projects` | 삭제된 프로젝트 복구 | `PROJECTS` 기능 관리자 (`AdminPermissionGate`) |

사이드바 메뉴: 업무 > "과제 관리"(`addon: "projects"`), 관리 > "프로젝트 관리"(`permission: "PROJECTS"`). [nav-items.ts](../../frontend/src/components/layout/nav-items.ts)

## 2. 파일과 역할

```text
frontend/src/
├── types/project.ts                      # 응답 타입 + 상태 이름표 + 사업자번호 표시(formatBusinessNo)
├── services/api/
│   ├── projects.ts                       # 백엔드 ProjectsController·ProjectMembersController·ProjectTasksController
│   ├── project-clients.ts                # 백엔드 ProjectClientsController
│   └── users.ts                          # searchUsers 추가 (GET /users/search, 핵심 공용)
├── features/project/
│   ├── hooks/use-projects.ts             # queryKey(projectKeys·clientKeys) + 조회 훅 + 변경 훅(무효화)
│   └── components/
│       ├── project-nav.tsx               # 하위 탭 (상세 /projects/123도 "프로젝트" 활성)
│       ├── project-list-view.tsx         # 목록 (PC 표 / 모바일 카드)
│       ├── project-form-dialog.tsx       # 만들기·수정 (만들면 상세로 이동)
│       ├── project-detail-view.tsx       # 상세 탭 + ?task 처리 + 개요 탭
│       ├── kanban-board.tsx              # ⭐ 칸반 (dnd-kit, 낙관적 업데이트)
│       ├── task-form-dialog.tsx          # 과제 만들기·수정·삭제, 상태 변경(드래그 대안)
│       ├── project-members.tsx           # 참여자 탭 + 추가 창
│       ├── project-partners.tsx          # 협력사 탭 (하청기업, 외주 금액 합계는 BigInt)
│       ├── user-search-picker.tsx        # 회원 검색·선택 (300ms 디바운스)
│       ├── my-tasks-view.tsx             # 내 할 일
│       ├── client-list-view.tsx          # 거래처 / 삭제된 거래처(삭제자·복구)
│       ├── client-form-dialog.tsx        # 거래처 등록·수정
│       ├── client-detail-dialog.tsx      # 거래처 상세 + 담당자 관리
│       ├── deleted-projects-view.tsx     # 관리자: 삭제된 프로젝트 복구
│       └── project-badges.tsx            # 상태 배지, 진척도 막대, 기간 표기
└── app/(main)/projects/ … app/admin/projects/   # 페이지는 조립만 (업무 로직은 features)
```

모든 화면 컴포넌트는 Client Component다(조회·상태·드래그). 페이지 파일은 Server Component로 두고 `metadata`, 경로 매개변수 확인(`notFound`)만 한다. 상세 페이지는 `useSearchParams`를 쓰는 화면을 `Suspense`로 감싼다.

## 3. 데이터 흐름

- **queryKey 두 갈래**: `projectKeys.all = ["projects"]`(목록·상세·칸반·내 할 일), `clientKeys.all = ["project-clients"]`.
  - 프로젝트·참여자·과제를 바꾸면 `useProjectMutation`이 `projects` 전체를 무효화한다. 과제 하나를 옮겨도 목록의 진척도가 바뀌기 때문이다.
  - 거래처를 바꾸면 `useClientMutation`이 거래처와 프로젝트를 함께 무효화한다(프로젝트 목록에 거래처 이름이 보이므로).
- **권한별 버튼**: 상세 응답의 `myAccess`(`canManage`·`isAdmin`, 금액 열람 규칙은 11/17에 없앰)로 수정·삭제·참여자 관리 버튼을 고른다. 숨김은 편의일 뿐이고 서버가 같은 기준으로 403을 낸다.
- **알림 → 과제 창**: 알림 link `/projects/:id?task=:taskId`. 상세는 `?task`를 상태로 복사하지 않고 렌더마다 계산한다(`taskForm ?? urlTask`). 창을 닫으면 `router.replace`로 `?task`를 지운다.
  - 처음에는 `useEffect`에서 `setTaskForm`을 했는데 lint(`react-hooks/set-state-in-effect`)가 막았다. effect로 상태를 맞추면 렌더가 한 번 더 일어나므로, 주소에서 바로 계산하는 쪽이 맞다.

## 4. ⭐ 칸반 (kanban-board.tsx)

1. `DndContext` 하나에 컬럼 3개. 컬럼은 `useDroppable({ id: "column:TODO" })`(빈 자리에 놓기), 카드는 `useSortable({ id: taskId })`.
2. 놓은 곳이 컬럼이면 그 컬럼 맨 끝, 카드 위면 그 카드 자리(`index`)로 본다.
3. **낙관적 업데이트**: 서버 규칙(`reorderColumn` — 옮기는 카드를 빼고 그 위치에 끼움)과 같은 방식으로 `setQueryData`를 먼저 바꾸고 `PATCH /tasks/:id/move { status, index }`를 보낸다. 실패하면 이전 캐시로 되돌리고 오류를 알린다. 끝나면 무효화로 서버 값과 맞춘다.
4. 순서 번호는 서버가 컬럼을 다시 매긴다(프로젝트 행 잠금). 화면은 `index`만 보낸다 → 두 사람이 동시에 옮겨도 번호가 꼬이지 않는다.
5. 클릭과 드래그 구분: `PointerSensor`의 `distance: 4`. 키보드 드래그(`KeyboardSensor`)도 되지만, 컬럼 사이 이동이 어려우면 카드를 열어 상태를 바꿀 수 있다(그 컬럼 맨 아래로 이동).
6. 좁은 화면: 3컬럼을 `min-w-[720px]`로 두고 가로 스크롤(요구사항 4: 표·보드는 명시적 가로 스크롤 허용).

## 5. 담당자 부재 표시

- 카드: 담당자 이름 옆 경고 아이콘 + "(부재)"(주황). 백엔드 `assigneeAbsent`(참여자에서 빠짐·퇴사·삭제).
- 과제 창: 부재 담당자는 선택지에 "(부재)"로 보이고(선택 불가), **일반 참여자는 담당자 선택이 잠긴다**(책임자만 교체, 서버도 403). 저장할 때 담당자는 **바뀐 경우에만** 보낸다 — 부재 과제의 제목만 고친 일반 참여자가 403을 받지 않게.
- 참여자 빼기 확인 창에 "담당하던 과제는 부재로 남으니 넘겨 달라"를 안내한다.

## 5-1. 협력사 탭 (2026-11-17 추가)

- 상세 탭에 "협력사" 추가(칸반 / 개요 / 참여자 / 협력사). 참여자 누구나 추가·수정·빼기. 회사는 거래처 목록에서 고르고(이미 협력사인 회사는 선택지에서 제외), 나머지는 직접 적는다.
- 담당자는 여러 명(이름·역할·연락처·이메일 행, [담당자 추가]·행 삭제, 최대 20명). 완전히 빈 행은 무시하고 일부만 적은 행은 이름이 있어야 한다. 저장할 때 목록 전체를 보낸다(서버가 교체). 표에는 담당자를 한 줄씩 보여 준다
- **금액**: 서버는 `Decimal(15,0)`을 문자열로 준다(`"12000000"`). 표시는 문자열에 쉼표만 넣고(`formatAmount`), 합계는 `BigInt`로 더한다. 입력은 숫자만 받아 `Number`로 보낸다(최대 999조 < 2^53이라 정확). tsconfig target이 ES2020 미만이라 BigInt 리터럴(`0n`) 대신 `BigInt("0")`을 쓴다.
- 거래처 목록: "발주 프로젝트 / 협력 프로젝트" 열(`_count.projects` / `_count.partners`).

## 5-2. 설명·내용 에디터 (2026-11-17 사용자 결정)

- 프로젝트 설명·과제 내용을 textarea → 공용 Tiptap 에디터로 바꿨다. **본문 이미지는 끔**(`allowImages={false}`, 서버도 저장 시 이미지를 지움 - 공개 uuid 주소라 참여자만 보는 프로젝트에 맞지 않음).
- 에디터를 `features/board/`에서 **[components/editor/](../../frontend/src/components/editor/)**로 옮겼다(`rich-text-editor.tsx`, `rich-text-content.tsx`, `video-embed.ts`). 게시판·결재·과제 관리 세 기능이 쓰므로 AGENTS.md 12장 "여러 기능이 쓰면 공용 위치" 기준.
- 저장 시 백엔드 `toEditorHtml`(`sanitizeEditorHtml`, 이미지 불허)로 정제하고, 개요 탭은 `RichTextContent`로 그린다. 한도는 태그 포함 50,000자.
- 에디터 도구 막대가 들어가도록 프로젝트·과제 창을 `sm:max-w-2xl` + 창 안 스크롤로 넓혔다.

## 5-3. 견적서 (2026-11-17)

| 경로 | 화면 |
|---|---|
| 상세 "견적" 탭 | 계약 금액(확정 합계) + 견적 목록(번호·견적명·버전·상태·견적일·합계). 발주처가 없으면 안내만 |
| `/projects/[id]/quotes/new` | 새 견적 (`NewQuoteView` → `QuoteEditor`) |
| `/projects/[id]/quotes/[quoteId]` | 견적 상세 (`QuoteDetailView`): 버전 선택, 견적서 양식, 상태별 버튼, 인쇄 |

- `quote-editor.tsx`: 품목 행 추가·삭제·위아래 이동, 수량·단가는 숫자만, 금액 미리보기는 `quote-calc.ts`(BigInt, 서버 `calcQuote`와 같은 규칙). 완전히 빈 행은 무시, 일부만 쓴 행은 오류. 저장 값은 서버가 다시 계산
- `quote-detail-view.tsx`: 고치기·결재 요청(또는 확정)·버전 삭제는 **최신 버전이 작성 중·반려**일 때만, 새 버전은 최신이 확정·결재 중이 아닐 때, 확정 취소는 확정 버전. `approvalEnabled`로 [결재 요청] / [확정]을 고른다. 반려면 안내 문구
- `quote-submit-dialog.tsx`: 결재라인만 지정(전자결재의 `ApprovalLineEditor` 재사용, 본인 제외). 제목·본문은 서버가 만든다
- `quote-document.tsx`: 견적서 양식(스냅샷 그대로). **인쇄**는 `window.print()` + `globals.css`의 `@media print`에서 `.print-area`만 보이게 한다(레이아웃은 그대로 두고 visibility만 끔, 서버 PDF 생성 없음)
- 결재 문서 본문의 품목표가 보이도록 `.rich-text table` 스타일 추가

## 5-4. 매출 (2026-11-17)

- 상세 "매출" 탭(`project-sales.tsx`): 요약 카드 4개(청구 매출·예상 매출·수금·미수금), 확정 견적별 청구 잔액, 청구 건 표(상태·청구일·합계·수금 상태, ⋯ 메뉴: 청구하기/수금 기록·수정·삭제 또는 청구 취소). 취소된 건은 회색 + 취소선
- `sale-form-dialog.tsx`: 공급가액만 입력, 부가세·합계 미리보기(`quote-calc.ts` 재사용), 견적을 고르면 과세 구분·부가세율을 그 견적 값으로 채우고 잔액을 보여 줌(수정 중이면 자기 금액을 잔액에 더해 계산). [바로 청구] 체크 시 청구일·승인번호·세금계산서 파일. 청구한 건은 금액·견적·과세 입력을 잠금
- `sale-detail-dialog.tsx`: 금액·날짜·승인번호, 세금계산서 파일(다운로드 전 보안 확인 창 - 게시판·결재와 같은 방식), 청구 예정이면 [청구], 청구면 수금 기록 목록·추가(남은 금액 표시)·삭제
- 세금계산서 파일 입력은 게시판의 `AttachmentField`를 그대로 쓴다(결재 문서도 같은 방식으로 가져다 씀)

## 5-5. 부가세율 입력 (2026-11-17)

- `tax-fields.tsx`(`TaxFields`): 과세/면세 선택 + 부가세율(%) 입력 칸. 견적 작성·매출 등록·협력사 추가가 같이 쓴다. 기본 과세 10%, 면세면 부가세율 칸을 잠근다(값은 남겨 둠)
- `quote-calc.ts`: `quoteTotals(items, taxType, vatRate)`. 부가세율을 1/100 % 정수로 바꿔 `BigInt`로 계산(`공급가액 × 330 ÷ 10000`, 버림) - 소수 부가세율도 서버 `calcVat`(Decimal)과 같은 값. `sanitizeVatRate`(입력 정리)·`vatRateError`(0~100, 소수 둘째 자리)
- 면세이거나 부가세율이 잘못됐으면 `vatRate`를 보내지 않는다(서버가 저장된 값 또는 10% 유지). 과세인데 잘못됐으면 폼 오류
- 표시는 `formatTax(taxType, vatRate)` → "과세 (부가세 3.3%)" / "면세" (견적서 양식·매출 상세·협력사 표). 협력사 표는 공급가액·합계(부가세 포함) 두 열

## 5-6. 예산·그래프 (2026-11-18)

- 상세 "예산" 탭(`project-budget.tsx`): 요약 카드 3개(예산·지출·남은 예산), 그래프 2개, 항목별 예산 표, 협력사별 지급 표, 지출 목록(증빙 파일 내려받기·수정·삭제). 예산을 넘은 금액은 빨간색으로만 표시한다. 금액은 공급가액 기준이라고 화면에 안내하고, 협력사 표에만 실제 지급액(부가세 포함) 열을 함께 둔다
- `budget-edit-dialog.tsx`: 항목별 금액 입력. 저장은 **목록 전체 교체**라 비용 항목을 불러오지 못하면 저장 버튼을 막는다(화면에 없던 예산이 지워지지 않게)
- `expense-form-dialog.tsx`: 공급가액 + `TaxFields`, 협력사 선택, 증빙 첨부(`AttachmentField`). 입력 중 예산 초과를 미리 경고하고(수정이면 이 건의 기존 금액을 빼고 계산), 저장 뒤에는 서버의 `budgetWarning`으로 알린다
- `project-charts.tsx`: recharts + shadcn/ui Chart(`components/ui/chart.tsx`). 월별 금액·항목별 비교·거래처 순위. **`charts-lazy.tsx`가 `next/dynamic`(`ssr: false`)으로 감싸** 그래프가 있는 탭·화면에서만 라이브러리를 불러온다
- 매출 탭에 월별 매출 그래프 추가. 매출은 "청구 매출" 카드와 같은 부가세 포함 합계, 지출은 공급가액 기준
- 관리자 `/admin/projects`(`admin-projects-view.tsx`): 탭 3개 = 통계(전사 그래프 4개) / 비용 항목(추가·이름 변경·숨기기) / 삭제된 프로젝트. 통계 상단 필터 = 기간(최근 12개월·연도)·거래처·프로젝트, 거래처를 고르면 프로젝트 선택지가 그 거래처의 것으로 좁혀지고, 한 거래처·프로젝트만 볼 때는 거래처 순위를 숨긴다

## 6. 설계 포인트
- 낙관적 업데이트를 왜 썼고, 실패하면 어떻게 되나? (되돌림 + 무효화, 서버가 순서의 최종 기준)
- 화면이 순서 번호를 계산하지 않고 `index`만 보내는 이유 (동시 이동, 서버 잠금)
- 버튼을 숨기는 것과 서버 권한 검사의 관계 (`myAccess`는 표시용)
- URL 상태(`?task`)를 effect로 복사하지 않은 이유
- 회원 검색 API를 왜 핵심에 새로 만들었나 (결재·채팅 검색은 애드온 소속 → 끄면 참여자 추가가 깨짐)

## 7. 확인한 것 / 못 한 것

- 확인 (2026-11-18): `typecheck`, `lint:check` 통과. 백엔드 단위 215개·e2e 166개(과제 관리 55개 포함) 통과. 사용자가 브라우저에서 기능 테스트 완료.
