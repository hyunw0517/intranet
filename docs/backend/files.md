# 파일 업로드 구조 (본문 이미지 · 첨부파일 · 썸네일)

> 작성일: 2026-11-05 · 브랜치 `backend/files` · 복습용 상세 문서
> 프론트 화면 쪽 설명은 [fe-07-files.md](../frontend/fe-07-files.md), 결정 과정은 [devlog](../devlog/2026-11-02.md)의 2026-11-05 항목을 참고한다.
> 이 문서의 값(용량, 확장자, 경로)은 작성 시점 코드 기준이다. 코드가 바뀌면 코드가 우선이다.

---

## 0. 한 장 요약

```text
① 업로드   POST /common/files/{images|attachments}
           → 검사(확장자·용량·이미지 시그니처) → 저장소에 저장 → Files 행 생성 (대상 없음)
           ← { id, url, thumbnailUrl, ... }

② 연결     POST/PATCH /boards/:boardId/posts
           → 한 트랜잭션: 글 저장 + 본문 <img>의 이미지 연결 + attachmentIds 연결
           (연결 조건을 updateMany WHERE에 걸고 count 확인 → 하나라도 안 맞으면 글까지 롤백)

③ 조회     본문 이미지  GET /common/files/images/:storedName      공개 (uuid가 사실상의 키)
           썸네일       GET /common/files/thumbnails/:storedName  공개
           첨부         GET /boards/:boardId/posts/:postId/files/:fileId  게시글 읽기 권한 확인 후

④ 정리     본문에서 지운 이미지 · 목록에서 뺀 첨부 · 삭제된 글의 파일 → soft delete (실제 파일은 남김)
```

기억할 원칙 다섯 가지:

1. **파일은 옮기지 않는다.** 처음부터 최종 위치에 저장하고, "어느 글의 파일인지"는 DB 컬럼만 바꾼다.
2. **클라이언트 값은 믿지 않는다.** 파일명, 확장자, MIME, 본문 HTML, 파일 id 모두 서버가 다시 확인한다.
3. **이미지는 공개, 첨부는 비공개.** `<img>`는 인증 헤더를 보낼 수 없기 때문이다.
4. **`common`은 업무를 모른다.** 권한 검사는 게시판 모듈이 하고, `FilesService`는 저장·조회·연결만 한다.
5. **저장 위치를 모른다.** `FilesService`는 `FileStorage` 추상 클래스만 알고, 로컬이든 S3든 구현체가 정한다.

---

## 1. 파일 구성

### 백엔드

| 파일 | 역할 |
|---|---|
| `src/common/const/file.const.ts` | 저장 종류(`FileKind`), 용량·확장자 제한, 공개 URL 접두사, 저장 파일명 정규식, 썸네일 설정 |
| `src/common/util/upload-options.util.ts` | 엔드포인트별 multer 옵션 (`IMAGE_UPLOAD_OPTIONS`, `ATTACHMENT_UPLOAD_OPTIONS`) |
| `src/common/util/image-signature.util.ts` | `detectImageMime`: 파일 앞 12바이트로 실제 이미지 형식 판별 |
| `src/common/util/thumbnail.util.ts` | `createThumbnail`(sharp), `thumbnailKey` |
| `src/common/util/sanitize-html.util.ts` | 본문 HTML 정제(`sanitizeEditorHtml`), 이미지 파일명 추출(`extractImageNames`) |
| `src/common/storage/file-storage.ts` | 저장소 계약 (추상 클래스, DI 토큰) |
| `src/common/storage/local-file-storage.ts` | 로컬 디스크 구현 (루트 = `backend/.env` `UPLOAD_ROOT=../uploads` → `intranet/uploads/`. 루트를 아는 유일한 곳) |
| `src/common/files.service.ts` | 업로드 저장, 공개 조회, 대상별 조회, 연결(`syncTargetFiles`), 삭제 |
| `src/common/files.controller.ts` | 업로드 2개 + 공개 이미지·썸네일 조회 |
| `src/common/common.module.ts` | `{ provide: FileStorage, useClass: LocalFileStorage }`, `FilesService` export |
| `src/boards/posts.service.ts` | `toContentFields`, `syncPostFiles`, 작성·수정·삭제 트랜잭션, `openAttachment`, 앨범 썸네일 |
| `src/boards/posts.controller.ts` | 첨부 다운로드 `GET :postId/files/:fileId` |
| `src/boards/dto/create-post.dto.ts` | `attachmentIds?: number[]` (최대 10개, 정수) |

### 프론트

| 파일 | 역할 |
|---|---|
| `services/api/files.ts` | `uploadImage`, `uploadAttachment`, 서버와 같은 제한 상수, 안내용 `checkUploadFile` |
| `services/api/posts.ts` | `PostInput.attachmentIds`, `downloadPostFile` |
| `services/api-client.ts` | `apiFetchBlob` (401 재발급 로직은 `apiFetch`와 공유) |
| `components/editor/rich-text-editor.tsx` | 이미지 버튼·붙여넣기·끌어놓기 업로드, `ServerImage` |
| `features/board/components/attachment-field.tsx` | 첨부 입력 (하나씩 순차 업로드) |
| `features/board/components/post-attachments.tsx` | 상세 화면 첨부 목록 + 내려받기 |
| `features/board/components/post-grid.tsx` | 앨범 그리드 |

---

## 2. 데이터 모델: `Files`

```prisma
model Files {
  id           Int             // 연결 시 클라이언트가 보내는 값 (첨부)
  targetType   FileTargetType? // POST(첨부) / POST_IMAGE(본문 이미지) / ... — 업로드 직후 null
  targetId     Int?            // 게시글 id 등 — 업로드 직후 null (다형 참조라 FK 없음)
  originalName String          // 사용자가 올린 파일명 (다운로드 파일명으로만 사용)
  storedName   String @unique  // 서버가 만든 uuid 파일명 (예: 3f2a...c1.png)
  path         String          // 저장소 key = "<종류>/<KST 연>/<월>/<storedName>" (예: images/2026/11/3f2a...c1.png)
  size, mimeType, order        // order = 표시 순서 (이미지는 본문 등장 순서)
  createdId, deleted, ...      // createdId = 업로드한 사람 (연결 권한 판단에 사용)
}
```

### 파일 한 개의 생애

```text
           업로드                       글 저장                    본문에서 삭제 / 첨부 빼기 / 글 삭제
[없음] ───────────▶ [미연결] ─────────────────▶ [연결됨] ──────────────────────────────▶ [soft delete]
                    targetType = null           targetType = POST_IMAGE                deleted = true
                    targetId   = null           targetId   = 글 id                     (저장소 파일은 남음)
                    createdId  = 나             order      = 0, 1, 2 ...
                    │
                    └ 저장하지 않고 나감 → 계속 미연결로 남음 (정리 배치 = 남은 일)
```

- **`path`의 접두사가 종류다.** 이미지인지 첨부인지를 별도 컬럼 없이 `path`가 `images/`로 시작하는지로 판단한다. 연결할 때 "첨부 id를 이미지 자리에 쓰는" 요청을 막는 데도 이 조건을 쓴다.
- **본문 이미지와 첨부의 `targetType`이 다르다** (`POST_IMAGE` / `POST`). 같은 글의 파일이라도 동기화 기준이 다르기 때문이다(이미지는 본문 기준, 첨부는 `attachmentIds` 기준).
- **썸네일은 행이 없다.** 원본 `path`에서 위치를 계산한다(`images/2026/11/<uuid>.png` → `thumbnails/2026/11/<uuid>.webp`, `thumbnailKey`). 원본 행만 있으면 찾을 수 있고, 위치를 두 곳에 저장하지 않으므로 어긋날 수 없다.
- **연·월 폴더는 KST 업로드 시각 기준**이다(`kstYearMonthPath`). 서버(EC2)는 UTC라 그대로 계산하면 KST 1일 0~9시 업로드가 전월 폴더로 간다. 연·월은 업로드 때 한 번 정해 `path`에 저장하고, 나중에 `createdAt`으로 다시 계산하지 않는다. 
- **날짜 폴더로 나눈 이유**
  1. **오류 추적**: 디스크·S3를 직접 볼 때 기간으로 대상 파일 범위를 좁힐 수 있다(예: "11월에 올린 파일이 깨진다"는 제보, 로그에 찍힌 path). 보통은 파일·글 id로 DB에서 `path`를 먼저 찾고, 날짜 폴더는 DB 없이도 범위를 좁히는 보조 수단이다.
  2. **월별 용량 확인**: `du -sh uploads/*/2026/*`(S3는 접두사별 크기)로 이번 달 증가량을 본다. 첨부 200MB(동영상)로 용량이 늘 수 있어 EC2 디스크 비용과 S3 전환 시점을 판단하는 근거가 된다.
  3. **폴더당 파일 수 제한 (로컬 디스크)**: 한 폴더에 수십만 개가 쌓이면 `ls`·복사·백업 도구가 느려진다. S3는 실제 폴더가 없는 key 문자열이라 이 이유는 해당하지 않는다.
  4. **저장 위치와 공개 URL 분리**: 공개 URL은 `storedName`만 쓰고 날짜는 DB `path`에만 있다. 그래서 저장 구조를 바꿔도 본문에 저장된 이미지 링크가 깨지지 않았고, 이전 형식(`images/<uuid>.png`)과 새 형식이 섞여도 동작한다.
- **주의**: 폴더는 업로드 시점 기준이라 글 작성일과 다를 수 있다(10/31 밤 업로드 → 11/01 저장이면 10월 폴더). 어떤 파일을 지울지(미연결·soft delete)는 폴더가 아니라 DB로 판단한다.

### 저장소 안의 모습 (로컬)

```text
intranet/uploads/                 (backend/.env UPLOAD_ROOT=../uploads, 상대 경로는 서버 실행 위치 backend 기준
                                   · 코드 폴더 밖(데이터와 코드 분리, Docker 빌드 범위 밖) · git 제외 · 운영은 S3 예정)
├── images/2026/11/<uuid>.png         본문 이미지 원본
├── thumbnails/2026/11/<uuid>.webp    썸네일 (원본과 같은 연·월, 같은 uuid)
└── attachments/2026/11/<uuid>.pdf    첨부
                                      (2026/11 = 업로드 시각의 KST 연·월)
```

---

## 3. 업로드 단계 상세

### 3.1 요청이 도착하기까지

```text
브라우저  POST /api/common/files/images  (multipart/form-data, 필드명 file, Authorization: Bearer ...)
   │  개발: Next.js rewrite / 운영: Nginx 가 /api 를 떼고 전달
   ▼
NestJS    POST /common/files/images
   ├ AccessTokenGuard (전역)     토큰 검증, tokenVersion·상태 확인
   ├ RolesGuard  @Roles(USER)    GUEST(승인 전)는 업로드 불가
   ├ FileInterceptor('file', IMAGE_UPLOAD_OPTIONS)   ← multer가 여기서 파일을 받는다
   └ FilesController.uploadImage → FilesService.saveUploaded(file, FileKind.IMAGE, user.id)
```

### 3.2 multer 옵션 (`upload-options.util.ts`)

| 옵션 | 값 | 이유 |
|---|---|---|
| `defParamCharset` | `'utf8'` | 브라우저는 한글 파일명을 UTF-8로 보내는데 busboy 기본값이 latin1이라 `originalname`이 깨진다 |
| `limits.fileSize` | 이미지 20MB / 첨부 200MB | 넘으면 multer가 중단 → 413 |
| `limits.files` | 1 | 요청 하나에 파일 하나. 여러 개는 프론트가 하나씩 올린다 |
| `fileFilter` | 확장자 허용 목록 | 1차 검사. 파일명은 클라이언트 값이라 이미지는 아래에서 다시 확인 |
| `storage` | `memoryStorage()` | multer는 **받기만** 한다. 저장은 `FilesService`가 검사 후 `FileStorage`로 |

**왜 엔드포인트마다 옵션을 따로 두나:** 전역 `MulterModule.register`는 옵션이 하나뿐이라 이미지와 첨부의 용량·확장자를 다르게 줄 수 없다.

**왜 `diskStorage`가 아니라 `memoryStorage`인가:** `diskStorage`는 multer가 곧바로 로컬 디스크에 쓴다. 그러면 저장 위치가 업로드 단계에 묶여서 S3로 바꿀 때 업로드 코드까지 고쳐야 하고, 검사(시그니처) 전에 파일이 이미 디스크에 생긴다.
대가: 최대 용량(첨부 200MB)이 요청마다 메모리에 올라온다. 동시 업로드가 몰리면 메모리 부담이 커진다 → S3 전환 때 **첨부만** presigned URL 직접 업로드로 바꾼다(2026-11-25 사용자 결정, 아래 표 "대용량" 줄).

### 3.3 `FilesService.saveUploaded` 단계

```text
1. file 없음 → 400 (필드명이 file이 아니면 여기서 걸림)
2. (이미지만) detectImageMime(buffer) 가 확장자의 MIME과 같은지 → 아니면 400
       .png 로 이름만 바꾼 html, 확장자와 실제 형식이 다른 파일 차단. mimeType도 검출값으로 저장
3. (이미지만) createThumbnail(buffer) → 실패하면 400 "손상된 파일"
       시그니처는 맞지만 내용이 깨진 이미지가 여기서 걸린다
4. storedName = randomUUID() + 확장자 (.jpeg 는 .jpg 로 통일)
   key = "images/<KST 연>/<월>/<storedName>"   (예: images/2026/11/<uuid>.png)
5. storage.save(원본) → storage.save(썸네일)   (썸네일 실패 시 원본 삭제)
6. prisma.files.create(...)                     (실패 시 원본·썸네일 삭제)
7. FileInfo 반환 { id, originalName, size, mimeType, url, thumbnailUrl }
       url / thumbnailUrl 은 이미지만, 첨부는 null
```

**이미지 시그니처 (`detectImageMime`)**

| 형식 | 파일 앞부분 |
|---|---|
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| JPEG | `FF D8 FF` |
| GIF | `GIF87a` / `GIF89a` |
| WEBP | `RIFF` + 4바이트 + `WEBP` |

- **svg를 빼는 이유:** svg는 XML이라 `<script>`를 담을 수 있다. 공개 주소로 열리면 우리 출처에서 스크립트가 실행될 수 있다.
- **첨부는 시그니처를 보지 않는 이유:** 형식이 너무 다양하다(hwp, docx 등). 대신 다운로드할 때 브라우저가 **절대 열지 않게** 헤더로 막는다(5.3).

**저장 순서 "저장소 먼저 → DB 나중"인 이유:** 반대로 하면 DB 기록 후 저장이 실패했을 때 "DB에는 있는데 파일이 없는" 행이 생겨 다운로드가 404가 된다. 지금 순서에서는 실패하면 저장한 파일을 지우므로 둘 다 남지 않는다. (지우기마저 실패하면 주인 없는 파일이 디스크에 남을 수 있지만, 사용자에게 보이는 문제는 없고 정리 배치 대상이다.)

**썸네일 (`createThumbnail`)**

```ts
sharp(image)
  .rotate()                                                         // EXIF 회전 정보 반영 (휴대폰 세로 사진이 눕지 않게)
  .resize(480, 480, { fit: 'inside', withoutEnlargement: true })    // 긴 변 480px, 비율 유지, 작은 이미지는 그대로
  .webp({ quality: 75 })
```

- 게시판 타입과 상관없이 **모든 본문 이미지**에 만든다. 업로드 API는 어느 게시판에 쓸지 모르고, 일반 → 앨범으로 바꾼 게시판의 기존 글도 바로 그리드에 나와야 하기 때문이다.
- 자르지(crop) 않는다. 정사각형 카드 모양은 화면 CSS(`object-cover`)가 맞춘다. 그래야 다른 비율의 미리보기에서도 같은 썸네일을 쓸 수 있다.
- 움직이는 gif·webp는 첫 프레임만 쓴다.
- 확인한 값: 2000×1500 jpg(EXIF 90° 회전) 18KB → 360×480 webp 404B

---

## 4. 연결 단계 상세 (글 작성·수정)

### 4.1 전체 순서 (`PostsService.createPost`)

```text
1. 게시판 권한 확인 (write)
2. toContentFields(content, user.id, postId = null)
      본문 정제 + 쓸 수 있는 이미지만 남김 → { content, contentText, imageIds }
3. 앨범 게시판인데 imageIds가 비었으면 400 (작성할 때만)
4. $transaction(async tx => {
      tx.post.create(...)
      syncPostFiles(tx, post.id, user.id, imageIds, attachmentIds ?? [])
   })   ← 파일 연결이 실패하면 글도 저장되지 않는다
```

수정(`updatePost`)도 같다. 차이는 두 가지다.
- `toContentFields`에 `postId`를 넘겨, **이 글에 이미 연결된 이미지**도 쓸 수 있는 이미지로 인정한다.
- `attachmentIds`를 **생략하면 첨부를 건드리지 않는다**(`undefined` → 동기화 생략). 빈 배열 `[]`이면 모두 삭제다. 화면은 항상 최종 목록을 보낸다.

### 4.2 본문에서 이미지 찾기 (`toContentFields`)

본문 이미지는 id를 따로 받지 않는다. **서버가 저장될 HTML에서 직접 찾는다.** 화면에 보이는 것(본문)과 연결되는 것(DB)이 어긋날 수 없게 하기 위해서다.

```text
① first = sanitizeEditorHtml(content)
      허용 태그만 남김. <img>는 src가 "/api/common/files/images/<uuid>.<ext>" 형태일 때만 남음
      (외부 이미지 https://..., data: base64, 엉뚱한 경로는 여기서 제거)
② names = extractImageNames(first.html)          본문 등장 순서, 중복 제거
③ usable = findUsableImages(names, 나, POST_IMAGE, postId)
      쓸 수 있는 이미지 = 삭제 안 됨 AND images/ 종류 AND
                         ( 내가 올린 미연결 이미지  OR  이미 이 글에 연결된 이미지 )
④ names 중 usable에 없는 게 있으면 → sanitizeEditorHtml(first.html, { allowImage }) 로 한 번 더 정제해 제거
⑤ imageIds = 최종 본문의 이미지 순서대로 id
```

**왜 남의 이미지·다른 글의 이미지 주소를 지우나:** 공개 주소라 복사해서 붙일 수는 있다. 하지만 그 이미지는 원래 글에 연결되어 있어서, 원래 글이 삭제되면 soft delete되고 내 글의 이미지도 깨진다. 한 파일이 두 글에 속하는 상태를 만들지 않는다.

**`extractImageNames` 버그 (구현 중 발견):** sanitize-html의 `exclusiveFilter`로 `<img>`를 모으는데, 처음에 `allowedTags: []`로 호출했다. `exclusiveFilter`는 **허용된 태그에만 호출**되기 때문에 한 번도 실행되지 않아 항상 빈 배열이 나왔다. 그 결과 이미지만 있는 본문이 빈 본문으로 처리되는 등 API 테스트 4개가 실패했다 → `allowedTags: ['img']`로 수정했다.

**빈 본문 판단:** 텍스트가 비어 있고 **이미지도 없을 때만** 빈 본문(`null`)이다. 사진만 올린 앨범 글이 빈 글이 되지 않게 하기 위해서다.

### 4.3 `FilesService.syncTargetFiles` — 목록을 "최종 상태"로 맞추기

받은 `fileIds`를 그 대상의 **최종 파일 목록(순서 포함)**으로 보고 DB를 맞춘다. 작성과 수정이 같은 함수를 쓴다.

```text
existing = 이 대상에 연결된 (삭제 안 된) 파일 id

1. 첨부 개수 > 10 → 400
2. existing − fileIds  →  soft delete           (목록에서 빠진 파일)
3. fileIds − existing  →  새로 연결
       updateMany({
         where: { id in linkIds, createdId: 나, targetType: null, targetId: null,
                  path startsWith "<종류>/", deleted: false },
         data:  { targetType, targetId },
       })
       count !== linkIds.length → 400 "사용할 수 없는 파일이 포함되어 있습니다" (트랜잭션 전체 롤백)
4. fileIds 순서대로 order = 0, 1, 2 ...
```

**왜 `findMany`로 검사하지 않고 WHERE + count인가:** "먼저 조회해서 확인 → 그다음 수정"으로 하면, 확인과 수정 사이에 같은 파일이 다른 요청(예: 다른 탭에서 저장한 다른 글)에 먼저 연결될 수 있다. 조건을 `UPDATE`의 `WHERE`에 직접 걸면, 조건에 맞는 행만 바뀐다. 바뀐 개수(`count`)가 요청 개수와 다르면 누군가 조건을 벗어났다는 뜻이므로 전체를 롤백한다. 회원 일괄 권한 변경에서 쓴 것과 같은 패턴이다.

WHERE 조건 하나하나가 막는 것:

| 조건 | 막는 요청 |
|---|---|
| `createdId: 나` | 다른 사람이 올린 파일 id를 내 글에 붙이기 |
| `targetType/targetId: null` | 이미 다른 글에 연결된 파일 가져오기 |
| `path startsWith '<종류>/'` | 첨부 id를 이미지로, 이미지 id를 첨부로 쓰기 |
| `deleted: false` | 삭제된 파일 되살리기 |

### 4.4 상황별 결과

| 상황 | 이미지 | 첨부 |
|---|---|---|
| 새 글 작성 | 본문 `<img>` 전부 연결, 순서 저장 | `attachmentIds` 연결 |
| 수정: 이미지 하나 지움 | 그 이미지 soft delete → 공개 주소 404 | — |
| 수정: 이미지 순서 바꿈 | `order` 갱신 → 앨범 대표 이미지도 바뀜 | — |
| 수정: 첨부 하나 뺌 | — | 그 첨부 soft delete |
| 수정: `attachmentIds` 생략 (API 직접 호출) | 본문 기준 동기화 | **유지** |
| 남의 첨부 id 포함 | — | 400, 글 수정도 롤백 |
| 다른 글 이미지 주소 붙여 넣음 | 본문에서 조용히 제거 | — |
| 글 삭제 | `POST`, `POST_IMAGE` 모두 soft delete (`softDeleteByTarget`) | 같음 |

---

## 5. 조회 단계 상세

### 5.1 본문 이미지 (공개)

```text
GET /common/files/images/:storedName   @IsPublic
1. storedName 이 uuid + (png|jpg|gif|webp) 정규식과 맞는지 → 아니면 404 (DB 조회 전에)
2. Files 에서 storedName, path startsWith 'images/', deleted: false 조회 → 없으면 404
3. storage.openStream(path) → 없으면 404
4. 헤더: Cache-Control: public, max-age=86400 / X-Content-Type-Options: nosniff
   StreamableFile(stream, { type: mimeType, length: size })
```

- **공개로 둔 이유:** 브라우저가 `<img src>`를 요청할 때는 `Authorization` 헤더를 붙일 수 없다. 우리 access token은 쿠키가 아니라 메모리에 있으므로 이미지 요청에 실리지 않는다. 그래서 **추측할 수 없는 uuid 파일명 자체를 키로** 쓴다(약 2¹²² 경우의 수).
- **대가:** 주소를 아는 사람은 로그인 없이 볼 수 있다. 그래서 볼 수 없는 비밀글의 썸네일 주소는 목록 응답에서 뺀다(6장).
- **정규식을 먼저 보는 이유:** `..%2F.env` 같은 경로 문자를 DB·저장소에 닿기 전에 거른다. 저장소 쪽(`LocalFileStorage.resolveKey`)도 업로드 루트 밖이면 오류를 내서 두 겹으로 막는다.
- **캐시를 하루로 둔 이유:** 같은 주소의 내용은 바뀌지 않으니 캐시하는 게 이득이다. 하지만 삭제된 이미지가 브라우저 캐시로 계속 보일 수 있어서 길게 두지 않았다.
- **`nosniff`:** 브라우저가 내용을 보고 형식을 추측(MIME sniffing)해 html로 해석하는 것을 막는다.

### 5.2 썸네일 (공개)

`GET /common/files/thumbnails/:storedName` — 원본과 같은 행 조회 규칙(원본이 삭제되면 썸네일도 404). `thumbnailKey(row.path)`(예: `thumbnails/2026/11/<uuid>.webp`)가 있으면 그것을, 없으면(썸네일 기능 이전 업로드 등) 원본을 준다.

### 5.3 첨부 다운로드 (비공개)

```text
GET /boards/:boardId/posts/:postId/files/:fileId   @Roles(USER)
1. PostsService.openAttachment
     checkPost(boardId, postId, user, 'read')   게시판 읽기 권한 + 그 게시판의 글인지 + 비밀글 규칙
     FilesService.openTargetFile(fileId, POST, postId)   그 글에 연결된 첨부인지 (아니면 404)
2. 헤더
     Content-Type: application/octet-stream
     Content-Disposition: attachment; filename="download"; filename*=UTF-8''<퍼센트 인코딩된 원본 이름>
     X-Content-Type-Options: nosniff
```

- **권한 검사를 `FilesService`가 아닌 게시판 모듈이 하는 이유:** `common`이 게시판·결재 모듈을 import하면 의존 방향이 꼬인다. 업무 모듈이 "이 사람이 이 글을 볼 수 있나"를 확인한 뒤 "이 글의 파일 하나"를 달라고 `FilesService`에 요청한다. 나중에 결재 첨부도 `ApprovalsController`가 같은 방식으로 쓴다.
- **`fileId`만으로 찾지 않는 이유:** `targetType + targetId`를 함께 조건으로 걸어서, 내가 볼 수 있는 글의 URL에 **다른 글의 파일 id**를 넣는 요청을 막는다(404).
- **헤더 셋의 의미:**
  - `octet-stream` + `attachment`: 어떤 파일이든 브라우저가 열지 않고 저장만 한다. 누군가 html 파일을 첨부로 올려도 우리 출처에서 실행되지 않는다(첨부는 시그니처 검사를 안 하므로 이것이 방어선이다).
  - `filename*=UTF-8''…`: RFC 5987 방식의 한글 파일명. `filename="download"`는 이를 모르는 오래된 클라이언트용이다.
- **프론트:** `<a href>`는 Bearer 헤더를 못 보내므로 `fetch`로 Blob을 받는다. `URL.createObjectURL`로 임시 `blob:` 주소를 만들고, `a.download = originalName`으로 저장한 뒤 주소를 해제한다. 파일명은 헤더를 파싱하지 않고 목록의 `originalName`을 쓴다.
  - 한계: Blob 방식은 파일 전체를 브라우저 메모리에 받은 다음 저장한다. 200MB 동영상처럼 큰 파일에는 불리하다(S3 전환 시 presigned 다운로드 URL이 대안).

### 5.4 첨부 이미지 썸네일 · 여러 파일 한 요청 (채팅 파일 메시지, 2026-11-13)

채팅 파일 메시지(features.md 8.4)를 위해 핵심에 범용 기능 두 가지를 더했다. common은 여전히 채팅을 모른다.

- **첨부 썸네일**: `saveUploaded( file, ATTACHMENT, userId, { attachmentThumbnail: true } )`
  - 이미지 확장자이고 **시그니처가 확장자와 같을 때만** 썸네일(480px webp)을 만든다. 아니면(가짜·깨진 파일) 업로드는 받되 썸네일이 없다 — 첨부는 원래 시그니처를 보지 않으므로 거절하지 않는다.
  - 이미지 MIME은 시그니처로 확인했을 때만 저장한다(클라이언트가 보낸 `image/*`는 믿지 않음, 아니면 `application/octet-stream`).
  - 위치: `attachment-thumbnails/<연>/<월>/<uuid>.webp` (`thumbnailKey`). 원본과 같은 폴더에 `.webp`로 두면 원래 webp인 첨부와 이름이 겹칠 수 있어 접두사를 나눴다.
  - 열기: `openTargetThumbnail( fileId, targetType, targetId )` — `openTargetFile`처럼 업무 모듈이 권한을 확인한 뒤 호출. 썸네일이 없으면 404(화면이 엑스박스).
- **여러 이미지 한 요청 / 이미지가 아닌 첨부 하나** (2026-11-13 사용자 결정으로 나눔)
  - `ATTACHMENT_IMAGES_UPLOAD_OPTIONS`: 이미지 확장자만, 장당 `MAX_IMAGE_SIZE`(20MB), 최대 `MAX_ATTACHMENTS_PER_TARGET`(10)장 → 요청 최대 200MB
  - `ATTACHMENT_NON_IMAGE_UPLOAD_OPTIONS`: 이미지가 아닌 첨부 확장자, `MAX_ATTACHMENT_SIZE`(200MB), 1개
  - **한도는 multer에서 건다.** memoryStorage라 받은 뒤 검사하면 이미 메모리에 올라온 뒤다. 처음에는 첨부 한도(200MB)로 여러 장을 받게 해서 묶음 요청 하나가 200MB × 10 = 2GB까지 메모리에 올라올 수 있었다 → multer 한도는 경로마다 하나라 경로를 둘로 나눴다
- **여러 대상의 파일 한 번에**: `listByTargets( targetType, targetIds )` → 대상 id별 파일 목록 (메시지 목록 한 페이지당 쿼리 1번)
- 채팅 쪽 경로: 보내기 `POST /chats/:roomId/images`(이미지 1~10장) · `POST /chats/:roomId/files`(그 밖의 파일 1개, 이미지 확장자 400), 다운로드 `GET /chats/:roomId/files/:fileId`(5.3과 같은 헤더), 썸네일 `.../thumbnail`(`image/webp`, `Cache-Control: private`). 권한 = 활성 참여자 + 참여 이후 메시지 + 삭제 안 됨 (`ChatMessagesService.findReadableFileMessage`)

---

## 6. 앨범 게시판

```text
목록 요청 (ALBUM 게시판)
1. 글 목록 조회 (평소와 같음)
2. 볼 수 있는 글만 골라 (canViewSecret: 비밀글은 작성자·게시판 관리자만)
3. Promise.all
     findFirstByTargets(POST_IMAGE, ids)   ← where order = 0, 페이지당 쿼리 1번
     countByTargets(POST_IMAGE, ids)       ← GROUP BY target_id, 페이지당 쿼리 1번
4. 각 글에 thumbnailUrl(없으면 null → "대표 이미지 없음"), imageCount(본문 이미지 수, 볼 수 없는 비밀글 0) 추가
5. 화면: 대표 이미지 1장 + 2장 이상이면 우측 하단에 "+나머지 수(이미지 아이콘)"
```

| 결정 | 이유 |
|---|---|
| 대표 이미지 = `order = 0` 이미지, 컬럼 없음 (사용자 결정, B안) | 이미지 순서를 이미 본문 순서로 저장하므로 첫 번째 이미지가 곧 대표. `thumbnailFileId` 컬럼을 두면 같은 정보가 두 곳에 생겨 어긋날 수 있다 |
| 앨범 작성 시에만 이미지 필수 | 수정·타입 변경으로 이미지가 없어진 글은 대체 이미지로 표시 (docs/design/features.md 5.3) |
| 볼 수 없는 비밀글은 `thumbnailUrl: null` | 이미지 주소가 공개이므로, 제목을 가리는 것처럼 주소도 응답에서 빼야 한다 |
| N+1 없이 한 번에 조회 | 글마다 조회하면 페이지 20개 = 쿼리 20번 → `targetId in (...)` 한 번 |
| 여러 장을 모자이크로 보이지 않고 1장 + "+N" (사용자 결정) | 4분할 모자이크도 검토했지만 모바일 2열에서 칸이 약 85px로 작아짐. 대표 이미지 1장을 크게 두고 나머지는 개수만 알린다 |

---

## 7. 저장소 추상화와 S3 전환

```ts
// file-storage.ts
export abstract class FileStorage {
  abstract save(key: string, body: Buffer, mimeType: string): Promise<void>;
  abstract openStream(key: string): Promise<Readable | null>;   // 없으면 null → 404
  abstract remove(key: string): Promise<void>;                  // 없어도 오류 없음
}

// common.module.ts
{ provide: FileStorage, useClass: LocalFileStorage }
```

- **interface가 아닌 abstract class인 이유:** TypeScript interface는 컴파일하면 사라진다. Nest DI는 런타임에 "무엇을 주입할지" 토큰이 필요한데, 클래스는 런타임에도 남아서 토큰으로 쓸 수 있다. `FilesService`는 `constructor(private storage: FileStorage)`만 쓰면 된다.
- **key 규칙이 저장소와 무관하다:** `images/2026/11/<uuid>.png`는 로컬에서는 `uploads/` 아래 상대 경로, S3에서는 객체 키로 그대로 쓴다. DB 데이터를 옮길 필요가 없다.

### S3로 바꿀 때 할 일

| 할 일 | 설명 |
|---|---|
| `S3FileStorage` 작성 | `@aws-sdk/client-s3`의 `PutObject`(save), `GetObject` Body 스트림(openStream, NoSuchKey → null), `DeleteObject`(remove) |
| provider 교체 | `useClass` 교체. 로컬 개발도 유지하려면 환경변수로 구현체를 고르는 `useFactory` |
| 인증 | 액세스 키를 `.env`에 두지 않고 EC2 IAM Role(인스턴스 프로파일)로 |
| 기존 파일 이전 | `uploads/` 폴더를 같은 key 구조로 버킷에 업로드하면 DB 수정 없이 동작 |
| 대용량 첨부 (2026-11-25 결정) | **첨부만** 브라우저 → S3 presigned URL 직접 업로드(서버 메모리·nginx 부담 제거). ① 업로드 요청(권한·확장자·크기 검사, `Files` 대기 행, 크기 상한을 넣은 짧은 만료 URL) → ② 브라우저가 S3에 직접 PUT → ③ 완료 알림(서버가 `HeadObject`로 존재·크기 확인, 앞부분을 읽어 형식 확인). 이미지는 썸네일(`sharp`)·시그니처 검사가 서버에서 필요해 지금처럼 서버 경유. 정할 것: 대기 파일 정리(S3 수명 주기 규칙 또는 배치), 버킷 CORS, 다운로드도 presigned로 할지 |
| (선택) 이미지 전송 | CloudFront 앞에 두기. 지금은 NestJS가 스트리밍하는 구조 그대로도 동작 |

바꾸지 않는 것: 컨트롤러, `FilesService`, 게시판 코드, 프론트, DB.

로컬 디스크를 계속 쓴다면: 운영 컨테이너에서 `UPLOAD_ROOT` 위치를 Docker 볼륨으로 마운트해야 재배포해도 파일이 남는다.

---

## 8. 보안 점검표 (위협 → 대응)

| 위협 | 대응 | 위치 |
|---|---|---|
| html·스크립트를 `.png`로 올려 공개 주소에서 실행 | 시그니처 검사, svg 제외, `nosniff` | `detectImageMime`, `files.controller` |
| 첨부 html이 우리 출처에서 열림 | `octet-stream` + `attachment` + `nosniff` | `posts.controller` 다운로드 |
| 경로 탐색 (`../../.env`) | 저장 파일명은 서버가 만든 uuid, 조회 시 정규식, 저장소 루트 밖 거부, 클라이언트 경로로 파일을 옮기는 단계 없음 | `STORED_IMAGE_NAME_REGEX`, `resolveKey` |
| 남의 파일·다른 글 파일을 내 글에 연결 | WHERE(`createdId`, 미연결, 종류) + `count` 확인, 트랜잭션 롤백 | `syncTargetFiles` |
| 다른 글 URL로 첨부 다운로드 | `checkPost` + `targetType/targetId` 조건 | `openAttachment`, `openTargetFile` |
| 외부 이미지로 열람자 정보 수집 | 본문에 우리 서버 이미지 주소만 허용 | `sanitizeEditorHtml` `exclusiveFilter` |
| 비밀글 이미지 노출 | 볼 수 없는 비밀글은 썸네일 주소를 응답에서 제외 | `paginatePost` |
| 대용량으로 서버 부담 | multer `fileSize`·`files: 1`, 첨부 10개 제한 | `upload-options.util` |
| 승인 전 회원(GUEST)의 업로드 | `@Roles(USER)` | `files.controller` |

알고 있는 약점:
- 공개 이미지는 주소만 알면 누구나 볼 수 있다(uuid라 추측은 불가능하지만, 주소가 유출되면 막을 수 없다). 삭제 후에도 캐시로 최대 하루 보일 수 있다.
- 업로드만 하고 저장하지 않은 파일, soft delete된 파일이 저장소에 쌓인다.
- 업로드 파일 바이러스 검사는 하지 않는다.

---

## 9. 프론트 흐름

**본문 이미지** (`rich-text-editor.tsx`)
```text
이미지 버튼 / 붙여넣기 / 끌어놓기
→ checkUploadFile (확장자·용량 안내, 실제 차단은 서버)
→ uploadImage(file) → 응답 url
→ editor.setImage({ src: url, alt: originalName })
```
- `ServerImage`: Tiptap Image 확장의 `parseHTML`을 바꿔 **우리 서버 주소의 `<img>`만** 에디터에 받아들인다(`allowBase64: false`). 서버가 외부 이미지를 지우므로, 에디터에서 보이던 이미지가 저장 후 사라지는 일을 막는다.
- 업로드 중에는 개수를 세어 `onUploadingChange`로 폼에 알리고, 폼은 등록 버튼을 "파일 올리는 중"으로 잠근다.

**첨부** (`attachment-field.tsx`)
```text
파일 선택 → 남은 개수(10 − 현재)만큼 → 하나씩 순서대로 uploadAttachment
→ 응답 FileInfo를 목록에 추가 → 글 저장 시 attachmentIds = 목록의 id
```
- 목록에서 빼도 서버 파일은 지우지 않는다. 저장하지 않으면 미연결로 남고, 저장하면 빠진 파일이 soft delete된다.

---

## 10. 남은 일

- **미연결·삭제 파일 정리 배치:** 예) 업로드 후 하루가 지나도 미연결인 파일, soft delete 후 일정 기간 지난 파일 → 저장소 원본 + `thumbnailKey(path)` 썸네일 삭제 + 행 정리.
- 운영 `uploads` Docker 볼륨 또는 `S3FileStorage`.
- 결재 첨부(`APPROVAL_DOCUMENT`)에 같은 `syncTargetFiles` / `openTargetFile` 재사용.
- Docker(Linux) 이미지에서 sharp 설치 확인 (Windows용 바이너리와 다르므로 컨테이너 안에서 `npm ci`).

---

## 11. 복습 질문 (답은 위 각 장)

1. 업로드할 때 왜 글 id 없이 `Files` 행을 만드나? 업로드만 하고 나가면 어떻게 되나? → 2장, 9장
2. 본문 이미지는 왜 id 배열이 아니라 본문 HTML에서 찾나? → 4.2
3. 연결 조건을 `findMany`로 확인하지 않고 `updateMany` WHERE에 넣은 이유는? `count`는 왜 보나? → 4.3
4. PATCH에서 `attachmentIds`를 생략할 때와 `[]`를 보낼 때 차이는? → 4.1, 4.4
5. 이미지는 공개, 첨부는 비공개로 나눈 이유는? 공개 이미지의 약점과 보완은? → 5.1, 6장
6. 첨부 다운로드 헤더 세 개(`octet-stream`, `attachment`, `nosniff`)는 각각 무엇을 막나? → 5.3
7. `memoryStorage`를 쓴 이유와 대가는? → 3.2
8. 저장소에 먼저 쓰고 DB에 나중에 기록하는 이유는? → 3.3
9. `FileStorage`를 interface가 아니라 abstract class로 만든 이유는? S3로 바꾸면 어디를 고치나? → 7장
10. 썸네일을 앨범 게시판이 아닌 모든 이미지에 만드는 이유는? 대표 이미지 컬럼을 두지 않은 이유는? → 3.3, 6장
11. `extractImageNames`가 빈 배열을 돌려준 버그의 원인은? → 4.2
