# FE-20 조직도 · 사원 검색

> 작성일: 2026-11-19 · 규칙은 [features.md 5.1](../design/features.md), 프로필 사진은 [fe-19-profile-image.md](fe-19-profile-image.md)

## 1. 한 장 요약

```text
사이드바 "조직도" (대시보드와 전자결재 사이, USER 이상)
├── /organization            [조직도]   GET /organization/chart → 부서 트리 + 인원 수
│                                      부서 클릭 → GET /organization/chart/:departmentId/members
└── /organization/directory  [사원 검색] GET /organization/directory?search=&page=&take=20

사람 클릭 → 상세 창 (목록 응답을 그대로 사용, 별도 조회 없음) → [채팅하기] (채팅 애드온이 켜져 있을 때만)

채팅 메시지 위 사진·이름 클릭 → GET /organization/directory/:userId → 같은 상세 본문 (재직 중이 아니면 404 안내)
```

- 관리자용 `GET /departments`(`@RequireAdmin`)·`GET /users`를 일반 직원에게 열지 않고, **공개해도 되는 값만 내보내는 API를 따로** 만들었다. 같은 데이터라도 받는 사람에 따라 응답 범위가 다르기 때문이다.
- 조직도 구성원과 사원 검색은 응답 형태(`DirectoryUser`)가 같다. 그래서 상세 창 하나를 두 화면이 같이 쓴다.

## 2. 파일

### 백엔드 (`organization` 모듈, 핵심)

| 파일 | 역할 |
|---|---|
| `org-chart.controller.ts` | `chart`, `chart/:departmentId/members`, `directory` (모두 `@Roles(USER)`) |
| `org-chart.service.ts` | 대상 조건(`directoryUserWhere`), 공개 필드(`directoryUserSelect`), 트리(`toTreeList` 재사용) + 인원 수(`groupBy` 1번), 구성원 정렬, 검색 페이지(`PaginatePage`), 프로필 사진(`findProfileImageUrls` 1번) |
| `dto/directory-query.dto.ts` | `search`(50자) + `page`·`take` |
| `test/org-chart.e2e-spec.ts` | 트리·인원 수(퇴사·승인 대기·하위 부서 제외), 정렬, 공개 범위(hp·birthday 없음), 404, 검색·페이지, GUEST 403 |

### 프론트

| 파일 | 역할 |
|---|---|
| `services/api/org-chart.ts` | API 함수·타입 (백엔드 `org-chart.controller`와 1:1) |
| `features/org-chart/hooks/use-org-chart.ts` | `orgChartKeys`, `useOrgChart`, `useDepartmentMembers`, `useDirectory`(`keepPreviousData`) |
| `features/org-chart/components/org-chart-nav.tsx` | 하위 탭 (과제 관리 `ProjectNav`와 같은 방식) |
| `features/org-chart/components/org-chart-view.tsx` | 부서 트리(접고 펼치기) + 구성원 카드. lg 미만은 트리를 [부서 선택] 버튼으로 접는다 |
| `features/org-chart/components/directory-view.tsx` | 검색 + 표(md 이상) / 카드(md 미만) + `PaginationBar` |
| `components/common/user-profile-content.tsx` | 사원 상세 본문 (사진·소속 전체·직급·직책·이메일·회사 전화). 조직도와 채팅이 같이 쓰고, 아래 버튼은 각 기능이 `actions`로 넣는다 |
| `features/org-chart/components/directory-user-dialog.tsx` | 조직도·사원 검색의 상세 창 (목록 응답 그대로) |
| `features/chat/components/chat-user-profile-dialog.tsx` | 채팅 보낸 사람 창 (`useChatUserProfile` → 사원 한 명 API) |
| `features/chat/components/start-chat-button.tsx` | 다른 화면에서 1:1 채팅 열기. 채팅을 못 쓰거나 본인이면 그리지 않는다 |
| `app/(main)/organization/` | `layout.tsx`(탭), `page.tsx`, `directory/page.tsx` |
| `components/layout/nav-items.ts` | "조직도" 메뉴 |

## 3. 결정과 이유

- **트리는 서버가 평평한 목록 + `depth`로 준다.** 관리자 부서 목록과 같은 `toTreeList`(전위 순회)를 쓰므로, 화면은 들여쓰기만 하면 된다. "다음 항목의 depth가 더 크면 하위가 있다"로 접기 버튼을 그리고, 접힌 부서보다 깊은 항목은 건너뛴다.
- **구성원 정렬은 서버에서** 한다: 그 부서에서의 직책 `sortOrder` → 직급 `sortOrder`(작을수록 높음) → 이름. 직책·직급이 없는 사람은 뒤로 보낸다. 같은 사람이라도 부서마다 직책이 달라서(겸직) DB `orderBy`로 표현하기 어려워 조회 후 정렬했다(부서 한 개의 인원이라 양이 적다).
- **인원 수는 `UserDepartment` groupBy 한 번**으로 센다. 부서마다 count를 부르지 않는다.
- **채팅 버튼은 채팅 기능 폴더에 둔다.** 조직도는 채팅을 모르고 `StartChatButton`만 가져다 쓴다. 채팅 애드온이 꺼지면 버튼이 사라진다(`useChat().enabled`).
- 검색 결과는 상세 창을 위해 다시 부르지 않는다. 목록 응답에 이미 공개 범위의 값이 모두 있다.
- 채팅 메시지(`ChatMessageView`)에는 보낸 사람 id·이름만 있으므로, 사진·이름을 누를 때만 사원 한 명 API로 받는다. 메시지·소켓 응답을 키우지 않기 위해서다. 퇴사·비활성 회원은 404라 "재직 중인 직원 정보를 찾을 수 없습니다"가 보인다.

## 4. 설계 포인트
- 관리자 API에 `@Roles(USER)`를 붙여 재사용하지 않고 API를 따로 만든 이유: 응답에 휴대폰·생일·권한·상태 같은 관리용 값이 섞여 있어, 받는 사람별로 select를 나누는 편이 안전하다.
- 겸직자를 여러 부서에 보여 주면서 정렬 기준(직책)이 부서마다 달라지는 문제를 어떻게 처리했는가.
- 프로필 사진을 회원 목록에 붙일 때 N+1을 피한 방법(`IN` 조회 1번 → Map).
