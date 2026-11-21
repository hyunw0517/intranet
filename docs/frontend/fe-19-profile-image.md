# FE-19 프로필 사진

> 작성일: 2026-11-19 · 규칙은 [features.md 5.1](../design/features.md), 파일 업로드 구조는 [files.md](../backend/files.md)

## 1. 한 장 요약

```text
마이페이지 [사진 등록]
  → checkUploadFile (확장자·용량 안내용 검사)
  → POST /common/files/images        (기존 본문 이미지 업로드 그대로: 시그니처 검사 + 썸네일 생성, 미연결 Files 행)
  → PUT  /users/me/profile-image     { fileId } → 한 트랜잭션: syncTargetFiles(USER_PROFILE, 회원 id) + 감사 로그
  ← 내 정보(CurrentUser, profileImageUrl 포함) → setUser → 헤더·마이페이지 즉시 반영

[삭제] → DELETE /users/me/profile-image → 같은 syncTargetFiles에 빈 목록 → 이전 사진 soft delete
```

- 새 테이블·컬럼은 없다. 이미 있던 `FileTargetType.USER_PROFILE`과 게시글 첨부에 쓰던 `syncTargetFiles`를 그대로 쓴다.
  "회원당 1장"은 fileIds를 `[fileId]` 하나로 보내는 것만으로 지켜진다(목록에서 빠진 기존 사진은 soft delete).
- 사진 주소는 게시판 본문 이미지와 같은 **uuid 공개 주소**다. `<img>`는 인증 헤더를 보낼 수 없어서다(사용자 결정).
  응답의 `profileImageUrl`은 원본이 아니라 **썸네일**(긴 변 480px webp) 주소다. 화면이 전부 작은 원형이기 때문이다.

## 2. 파일

### 백엔드

| 파일 | 역할 |
|---|---|
| `common/files.service.ts` | `findProfileImageUrls(userIds)`: 회원 여러 명의 썸네일 주소를 쿼리 1번으로 (`findFirstByTargets` 재사용) |
| `users/users.controller.ts` | `PUT`·`DELETE /users/me/profile-image` (`@Roles(USER)`) |
| `users/users.service.ts` | `setMyProfileImage`·`deleteMyProfileImage`, `getMyInfo`·`updateUser` 응답에 `profileImageUrl` |
| `users/dto/set-profile-image.dto.ts` | `fileId` (양의 정수) |
| `users/const/consent.const.ts` | `PRIVACY_COLLECTION` 1.1 |
| `chats/chat-view.ts`, `chats/chat-rooms.service.ts` | `ChatUserView.profileImageUrl` (방 목록·방 상세·상대 검색) |
| `test/profile-image.e2e-spec.ts` | 등록·교체·거부(남의 파일·첨부·이미 쓰인 이미지)·GUEST 403·채팅 응답·삭제 |

### 프론트

| 파일 | 역할 |
|---|---|
| `components/common/user-avatar.tsx` | `UserAvatar`: 사진이 없거나 못 불러오면 이름 첫 글자 (Radix Avatar의 Fallback) |
| `features/mypage/components/profile-image-field.tsx` | 마이페이지 등록·변경·삭제 (GUEST는 안내만) |
| `services/api/users.ts` | `setMyProfileImage`, `deleteMyProfileImage` |
| `types/user.ts`, `services/api/chats.ts` | `profileImageUrl` 필드 |
| `components/layout/user-menu.tsx` | 헤더 Avatar |
| `features/chat/components/chat-room-list.tsx` | 1:1 방 목록 Avatar (그룹은 기존 아이콘) |
| `features/chat/components/chat-room-members.tsx` | 참여자 목록 Avatar |
| `features/chat/components/chat-message-list.tsx` | 보낸 사람 이름 옆 Avatar (방 상세의 참여자 + 1:1 상대에서 찾음) |
| `features/auth/consent-documents.ts` | 선택 항목에 "프로필 사진", 버전 1.1 |

## 3. 결정과 이유

- **메시지마다 보낸 사람 사진을 싣지 않는다.** 메시지·소켓 푸시 형태(`ChatMessageView`)는 그대로 두고, 화면이 방 상세(`members`)의 사진을 보낸 사람 id로 찾는다. 이미 나간 그룹 참여자는 목록에 없어 이름 첫 글자로 보인다.
- **다른 사람의 사진 변경은 바로 반영되지 않는다.** 채팅 방 목록·상세를 다시 불러올 때 반영된다. 실시간 푸시는 하지 않는다.
- **동의 문서 1.1**: 기존 가입자에게 재동의를 받지 않는다(가입 때만 버전 검사). 사진은 선택 항목이고 본인이 올릴 때만 생긴다.
- 승인 대기(GUEST)는 업로드 API(USER 이상)를 쓸 수 없으므로 연결 API도 USER 이상으로 맞췄다. 그래서 본인 계정용 allowlist(`routeGuards.allowlist`)에 넣지 않았다.

## 4. 설계 포인트
- 프로필 사진을 `Users` 컬럼이 아니라 `Files` 다형 참조로 둔 이유와 대가: 업로드·검사·썸네일·soft delete를 재사용하지만, 회원 목록에 사진을 붙이려면 쿼리가 한 번 더 필요하다(`findProfileImageUrls`, N+1이 아니라 `IN` 1번).
- 공개 주소의 위험: 주소를 아는 사람은 로그인 없이 볼 수 있다. uuid라 추측은 어렵고, 게시판 이미지와 같은 수준으로 받아들였다.
