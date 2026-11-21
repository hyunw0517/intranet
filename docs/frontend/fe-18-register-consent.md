# FE-18 회원가입 필수 동의

회원가입을 `동의 → 가입 정보 입력` 2단계로 나눈다. 주소는 `/register` 하나이고 단계는 화면 상태로 관리한다.

## 구조

| 파일 | 역할 |
|---|---|
| `frontend/src/features/auth/components/register-form.tsx` | 단계 전환, 동의 상태 보관, 가입 요청에 `consents` 포함 |
| `frontend/src/features/auth/components/register-consent-step.tsx` | 동의 화면 (전체 동의, 항목별 체크박스, 본문) |
| `frontend/src/features/auth/consent-documents.ts` | 약관·개인정보 본문과 문서 버전 |
| `frontend/src/features/auth/hooks/use-consent-info.ts` | 회사명 조회 훅 |
| `frontend/src/services/api/auth.ts` | `ConsentType`, `RegisterInput.consents` |
| `backend/src/users/const/consent.const.ts` | 서버가 인정하는 현재 문서 버전 |

## 요청 흐름

0. 동의 화면이 `GET /auth/consent-info`(공개)로 개인정보처리자 회사명(`backend/.env`의 `COMPANY_NAME`)을 받아 본문에 넣는다. 받지 못하면 본문 대신 오류와 다시 시도 버튼을 보여 주고 다음 단계로 넘어갈 수 없다.
1. 두 항목을 모두 체크해야 `다음` 버튼이 활성화된다. 체크박스의 기본값은 미동의다.
2. `가입 신청` 시 `POST /auth/register/emp` 본문에 `consents: [{ type, version }]`을 함께 보낸다.
3. `AuthService`가 모든 항목이 현재 버전인지 확인한다. 아니면 400이다.
4. `UsersService.createUser`가 회원 생성과 `UserConsent` AGREE 행 2개를 한 트랜잭션으로 저장한다.

## Server/Client Component

단계 전환과 체크 상태가 있어 동의 화면은 Client Component다. 본문은 정적 데이터라 API로 받지 않는다.

## 본문 작성 기준

- 이용약관: 디지털콘텐츠 표준약관 제1~11조를 사내 인트라넷에 맞게 고쳐 썼다.
- 개인정보: 「알기 쉬운 개인정보 처리 동의 안내서」의 고지 사항(목적, 항목, 보유·이용 기간, 거부권과 불이익)을 따른다. 항목은 실제 코드가 저장하는 값만 적고 "등"으로 뭉뚱그리지 않는다.
- 목적과 보유·이용 기간은 굵은 글씨와 밑줄로 강조한다.
- 본문은 항목 제목 옆 `보기` 버튼으로 여는 모달에 16px로 표시한다.
- 항목 체크박스는 그 항목의 본문을 맨 아래까지 내린 뒤에, `전체 동의`는 두 본문을 모두 내린 뒤에 활성화된다. 화면이 커서 스크롤 없이 본문이 전부 보이면 열었을 때 바로 활성화된다. 열람 여부는 화면 상태로만 관리하고 서버에 저장하지 않는다.

## 문서를 개정할 때

본문을 바꾸면 `consent-documents.ts`와 `consent.const.ts`의 버전을 함께 올린다. 기존 회원의 재동의 화면과 동의 철회 기능은 아직 없다.

## 설계 포인트
- 동의 상태를 `Users` 컬럼이 아닌 이력 테이블에 두는 이유: 어느 버전에 언제 동의·철회했는지 남기기 위해서다.
- 프론트가 보낸 버전을 서버가 검증하는 이유: 옛 화면을 보고 동의한 요청이 새 버전 동의로 기록되지 않게 하기 위해서다.
- 가입과 동의를 같은 트랜잭션으로 묶는 이유: 동의 기록이 없는 회원이 생기지 않게 하기 위해서다.
