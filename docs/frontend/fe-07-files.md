# FE-07. 이미지·첨부파일 (본문 이미지 + 게시글 첨부)

> 작업일: 2026-11-05 · 브랜치 `backend/files`
> 파일 기능은 사용자 결정(2026-10-30)으로 백엔드까지 Claude가 작성했다. 백엔드 설계 합의는 메모리/devlog의 "Board & files plan" 참고.
> 앨범 썸네일은 같은 날 이어서 구현했다(5장). 백엔드 구조 상세(복습용)는 [docs/backend/files.md](../backend/files.md).

## 1. 전체 흐름

```text
[업로드]  파일 선택 ─▶ POST /api/common/files/{images|attachments} (multipart, 필드명 file)
                     └ NestJS: 확장자·용량 검사 → (이미지) 시그니처 검사 → FileStorage에 저장 → Files 행(대상 없음) 생성
                     ◀ { id, originalName, size, mimeType, url }

[본문 이미지]  응답 url(/api/common/files/images/<uuid>.png)을 에디터 <img src>로 넣는다.
[첨부]        응답 id를 폼 상태에 모아 두었다가 저장 시 attachmentIds로 보낸다.

[글 저장]  POST/PATCH .../posts  { ..., content, attachmentIds }
           └ 한 트랜잭션: 글 저장 + 본문 <img>로 찾은 이미지 연결 + attachmentIds 연결
             (내가 올린 미연결 파일만 연결, 아니면 400 → 글도 롤백)

[보기]    본문 이미지: <img src>가 공개 주소라 로그인 헤더 없이 표시 (GET /common/files/images/:storedName, @IsPublic)
          첨부: 상세 응답 files[] → 내려받기 버튼 → fetch(Bearer) → Blob → a[download]
               (GET /boards/:boardId/posts/:postId/files/:fileId, 게시글 읽기 권한 확인 후 스트리밍)
```

### 왜 이미지와 첨부를 나눴나

| | 본문 이미지 | 첨부 |
|---|---|---|
| 업로드 API | `POST /common/files/images` | `POST /common/files/attachments` |
| 형식·용량 | png·jpg·gif·webp, 20MB, **실제 시그니처 확인**(svg 제외) | 허용 확장자 목록(문서·이미지·zip·동영상 등), 200MB, 글당 10개 |
| 조회 | 공개 uuid 주소 (`<img>`는 Authorization 헤더를 못 보냄) | 비공개, 게시글 권한 확인 후 다운로드 |
| 글과 연결 | 서버가 본문 `<img>`에서 찾아 연결 (id를 따로 보내지 않음) | `attachmentIds`로 최종 목록 전달 |
| `Files.targetType` | `POST_IMAGE` | `POST` |

## 2. 파일 구조와 역할 (프론트)

| 파일 | 역할 |
|---|---|
| `services/api/files.ts` | 업로드 함수(`uploadImage`, `uploadAttachment`), 서버와 같은 확장자·용량 상수, 안내용 검사 `checkUploadFile` |
| `services/api/posts.ts` | `PostInput.attachmentIds`, 첨부 다운로드 `downloadPostFile` (Blob) |
| `services/api-client.ts` | `apiFetchBlob` 추가. 401 재발급·에러 변환은 `apiFetch`와 같은 함수(`sendWithRefresh`, `toApiError`)를 공유 |
| `types/file.ts` | `FileInfo` (이후 결재 첨부에서도 쓰므로 공용 types에 둠) |
| `components/editor/rich-text-editor.tsx` | 이미지 버튼, 붙여넣기·끌어놓기 업로드, `ServerImage`(우리 서버 주소 `<img>`만 받는 Image 확장) |
| `features/board/components/attachment-field.tsx` | 첨부 입력: 고르면 하나씩 업로드, 목록·빼기, 개수 표시 |
| `features/board/components/post-attachments.tsx` | 상세의 첨부 목록 + 내려받기 (받기 전 확인 창 + 보안 경고, 채팅과 공용 `components/common/file-download-confirm-dialog.tsx`, 2026-11-14 사용자 요청) |
| `features/board/components/post-form.tsx` | 첨부 상태, 업로드 중 등록 버튼 잠금, `attachmentIds` 전송 |
| `app/globals.css` | `.rich-text img` (본문 폭 제한) |

모두 Client Component다. 파일 선택·업로드·Blob 다운로드가 브라우저 API이고, access token이 브라우저 메모리에만 있기 때문이다.

## 3. 결정 사항

- **에디터에서도 외부 이미지를 받지 않는다** (`ServerImage.parseHTML`): 서버 정제가 외부 `<img>`를 지우므로, 에디터에서 보이던 이미지가 저장 후 사라지는 일을 막는다. (FE-06의 "기능은 서버 허용 목록 안에서만" 원칙과 같음)
- **다른 글의 이미지 주소를 붙여 넣으면 서버가 제거**한다. 그 글이 삭제되면 함께 깨지기 때문이다.
- **업로드 중에는 등록 버튼을 잠근다** (`파일 올리는 중`). 올라가기 전 파일이 빠진 채 저장되는 것을 막는다.
- **첨부는 항상 최종 목록을 보낸다.** 수정에서 모두 빼면 `[]` → 서버가 기존 첨부를 삭제. (API는 생략하면 유지하지만 화면은 항상 보낸다)
- **받기 전에 한 번 묻는다** (2026-11-14 사용자 요청, 보안 차원): `"파일명.확장자" 파일을 다운로드 받으시겠습니까?` + 주황 경고 박스 "출처를 알 수 없는 파일은 악성 코드가 포함되어 있을 수 있습니다." 확인 창은 목록 밖에 하나만 두고, 대상 파일과 열림 상태를 따로 둬서 닫히는 동안에도 제목의 파일명이 비지 않게 했다. 채팅 다운로드와 같은 공용 컴포넌트
- **다운로드 파일명**은 응답 헤더를 파싱하지 않고 목록의 `originalName`을 쓴다. (헤더의 `filename*` 해석이 브라우저 대신 JS 몫이 되므로 단순하게)
- 목록에서 뺀 미저장 업로드, 저장하지 않고 나간 업로드는 서버에 **미연결 파일**로 남는다. → 정리 배치는 남은 일.

## 4. 확인 결과 (2026-11-05)

- 백엔드 API 스크립트 27개 통과: 업로드(한글 파일명), 가짜 png·svg·exe 거부, 21MB 413, 비로그인 401, 공개 이미지 `nosniff`, 경로 문자 404, 남의 첨부 id·이미 연결된 첨부 400(글 롤백), 외부·다른 글 이미지 제거, 이미지만 있는 본문 유지, 다운로드 한글 파일명, 다른 글 경로로 다운로드 404, 수정 시 첨부 삭제·유지, 본문에서 지운 이미지 404, 글 삭제 시 이미지 404
- 브라우저 E2E(Edge, 1440px·390px) 28개 통과: 이미지 버튼 업로드·표시, 첨부 추가(exe 안내)·빼기, 등록, 상세 이미지·첨부, 내려받기 내용·파일명, 수정에서 첨부 제거·이미지 유지, 가로 넘침 없음
- `tsc`, `eslint` 통과 (백엔드 기존 decorator 린트 4건은 이전부터 있던 것)

## 5. 앨범 게시판 (같은 날 이어서 작업)

```text
[업로드]  본문 이미지 → 원본 저장 + 썸네일(thumbnails/<연>/<월>/<uuid>.webp, 긴 변 480px) 저장  ← 게시판 타입과 무관하게 항상
[목록]    앨범 게시판이면 글 목록 조회 후 "글별 order = 0 이미지"를 한 번 더 조회 → thumbnailUrl
          GET /api/common/files/thumbnails/<원본 uuid 파일명>  (공개, 썸네일 없으면 원본으로 대체)
[화면]    board.type === "ALBUM" → PostGrid (썸네일 카드), 그 외 → PostList (행 목록)
```

| 결정 | 이유 |
|---|---|
| 썸네일을 모든 이미지에 만든다 | 업로드 API는 게시판을 모른다. 일반 → 앨범 변경 시 기존 글도 바로 그리드에 나온다. 썸네일은 수 KB~수십 KB |
| 대표 이미지 컬럼(`thumbnailFileId`)을 두지 않는다 | 이미지 순서를 본문 순서로 저장하므로 `order = 0`이 곧 첫 번째 이미지. 같은 정보를 두 곳에 두면 어긋날 수 있다 (docs/design/features.md 5.3) |
| 썸네일은 `Files` 행 없이 원본 path에서 계산한다 | 원본 위치(`images/2026/11/<uuid>.png`)만 알면 `thumbnails/2026/11/<uuid>.webp`로 정해져서 행·연결 관리가 필요 없다 |
| 자르기 없이 비율 유지로 줄이고, 카드에서 `object-cover` | 다른 화면(정사각형이 아닌 미리보기)에서도 같은 썸네일을 쓸 수 있게 |
| 볼 수 없는 비밀글은 `thumbnailUrl: null` | 제목을 가리는 것과 같은 기준. 이미지 주소가 공개라 응답에서 빼야 한다 |
| 이미지 필수는 작성 때만 | docs/design/features.md 5.3. 수정·타입 변경으로 이미지가 없어진 글은 대체 이미지 |

- 이미지가 2장 이상인 글은 카드 우측 하단에 `+나머지 수` + 이미지 아이콘(`Images`) 배지를 붙인다. 서버 목록 응답의 `imageCount`(본문 이미지 수, 앨범이 아니거나 볼 수 없는 비밀글은 0) 기준이고, 대표 이미지가 없을 때는 표시하지 않는다. 사진 위에서 읽히도록 테마와 무관한 반투명 검정 배경을 쓴다.
- 파일: `features/board/components/post-grid.tsx`(그리드), `post-list.tsx`의 `canOpenPost`(목록·그리드 공용 비밀글 판단), `post-form.tsx`의 `requireImage`
- 썸네일 `<img>`는 `next/image`를 쓰지 않았다. 서버가 이미 줄인 이미지이고, `/api` 경로라 이미지 최적화 설정이 따로 필요해진다.
- 확인: API·화면 31개 통과 (480px·EXIF 회전 확인 – 2000×1500 jpg 18KB → 썸네일 360×480, 손상 이미지 400, 작은 이미지 확대 안 함, 일반 → 앨범 변경, 대표 이미지 순서, 수정으로 이미지 제거 시 대체 이미지, 다른 회원에게 비밀글 썸네일 숨김, 1440/390px 그리드·작성 안내)

## 6. 외부 영상 임베드 (YouTube·Vimeo)

동영상 파일을 본문에 올리지 않고(업로드·Range 처리·용량 부담), **외부 영상 주소만 본문에 넣는다** (사용자 결정, YouTube·Vimeo만). 쇼츠 같은 짧은 영상 파일은 첨부(200MB)로 올린다.

```text
[에디터]  "동영상" 버튼 → 주소 입력 → toVideoEmbedSrc()로 임베드 주소 변환 → VideoEmbed 노드 삽입
          watch?v= / youtu.be / shorts → https://www.youtube-nocookie.com/embed/<id>
          vimeo.com/<id>(/해시)      → https://player.vimeo.com/video/<id>(?h=해시)
[저장 HTML] <div data-video-embed><iframe src="임베드 주소" title loading allowfullscreen></iframe></div>
[서버 정제] iframe은 호스트 2개 + VIDEO_EMBED_SRC_REGEX 형식만 남김, 속성은 서버가 고정(src·title·loading·allowfullscreen)
```

| 결정 | 이유 |
|---|---|
| 공식 YouTube 확장 대신 영상 노드를 직접 만듦 (`components/editor/video-embed.ts`) | Vimeo는 공식 확장이 없음. 한 노드·한 HTML 형식으로 두 사이트를 처리하면 서버 허용 규칙도 하나로 관리되고 패키지도 늘지 않음 |
| YouTube는 `youtube-nocookie.com` 주소로만 저장 | 재생 전까지 YouTube 추적 쿠키를 남기지 않음. 서버도 이 주소만 허용 (`youtube.com/embed`를 API로 직접 보내면 제거됨) |
| 에디터 `parseHTML`도 허용 주소만 받음 | 서버가 지울 영상을 에디터가 보여 주지 않게 (`ServerImage`와 같은 원칙) |
| 프론트·백엔드에 같은 정규식을 둠 | shared 패키지를 두지 않는 방침(AGENTS.md 14장). 한쪽을 바꾸면 다른 쪽도 고쳐야 한다고 주석에 남김 |
| 영상만 있는 본문도 빈 본문이 아님 | 서버의 빈 본문 판단에 iframe 포함 |

- 함께 고친 버그: 이미지·영상을 넣은 직후 그 노드가 "노드 선택" 상태로 남아, 다음 삽입이 앞의 것을 **대체**했다(이미지 여러 장 한 번에 올리기, 영상 두 개 연속). → `insertChain`이 노드 선택이면 커서를 그 뒤로 옮긴 뒤 넣는다.
- 확인: 서버 정제 11개(허용 2사이트·해시, 다른 호스트·`youtube.com`·잘못된 경로·`javascript:` 제거, `onload`·`srcdoc`·`style` 제거, 영상만 있는 본문 유지), 주소 변환 12개, E2E 20개(1440/390px: 잘못된 주소 안내, 영상 창 저장이 게시글 폼을 제출하지 않음, 연속 삽입 2개 유지, 이미지 2장 동시 업로드 유지, 상세 16:9·넘침 없음, 수정 화면·수정 저장 후 유지), 실제 플레이어 로드(YouTube 제목·Vimeo 컨트롤 표시).

## 7. 설계 포인트
- `<img>`는 헤더를 못 보낸다 → 본문 이미지는 추측 불가능한 uuid 공개 주소, 첨부는 권한 확인 후 스트리밍으로 나눈 이유
- "먼저 업로드 → 저장 시 연결" + 연결 조건(내 파일·미연결·같은 종류)을 `updateMany`의 WHERE에 걸고 `count`로 확인 (회원 일괄 처리와 같은 패턴)
- 확장자·Content-Type은 클라이언트 값 → 이미지 시그니처 확인, 다운로드는 `application/octet-stream` + `attachment` + `nosniff`
- 저장소 추상화(`FileStorage`)로 로컬 → S3 교체 지점을 한 곳으로 모은 것
