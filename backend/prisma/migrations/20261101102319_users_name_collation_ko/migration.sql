-- 회원 이름을 한국어 순서(가나다)로 정렬하도록 컬럼 collation을 ICU 한국어로 변경
-- - DB 기본 collation(en_US.utf8, glibc)은 한글 음절을 가나다순으로 비교하지 않는다.
--   예) 기본: 가나 유저 하나 김철수 이영희 한하준 유저3 / ko-x-icu: 가나 김철수 유저 유저3 이영희 하나 한하준
-- - Prisma 스키마에는 collation을 적는 문법이 없어 마이그레이션 SQL로 직접 지정한다.
--   (migrate diff는 컬럼 collation을 비교하지 않으므로 이후 마이그레이션에서 되돌리지 않는다)
-- - ko-x-icu는 ICU를 포함해 빌드된 공식 postgres 이미지에 기본으로 들어 있다.
ALTER TABLE "users_model" ALTER COLUMN "name" SET DATA TYPE TEXT COLLATE "ko-x-icu";
