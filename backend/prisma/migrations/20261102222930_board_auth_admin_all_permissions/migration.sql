-- 게시판 관리 권한은 읽기·쓰기·댓글 권한을 포함한다. (기존 규칙 보정)
UPDATE "board_auth_model"
SET "auth_read" = true, "auth_write" = true, "auth_comment" = true
WHERE "auth_admin" = true;