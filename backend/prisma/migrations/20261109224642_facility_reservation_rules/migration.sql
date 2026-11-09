-- AlterTable
ALTER TABLE "facility_category_model" ADD COLUMN     "close_minute" INTEGER NOT NULL DEFAULT 1080,
ADD COLUMN     "max_advance_days" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "open_minute" INTEGER NOT NULL DEFAULT 540,
ADD COLUMN     "operating_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "slot_minutes" INTEGER NOT NULL DEFAULT 30;


-- ↓ Prisma 스키마로 표현할 수 없는 제약 (직접 작성, docs/design/features.md 6장)

-- 분류 설정 값 검사: 예약 단위 > 0, 0 <= 운영 시작 < 운영 종료 <= 1440(24:00), 예약 가능 기간 > 0, 운영 요일은 1~7 중 하나 이상
-- (operating_days는 Prisma 배열이라 컬럼이 NULL 허용으로 만들어지므로 NOT NULL도 여기서 막는다)
ALTER TABLE "facility_category_model" ADD CONSTRAINT "facility_category_settings_check" CHECK (
    "slot_minutes" > 0
    AND "open_minute" >= 0 AND "open_minute" < "close_minute" AND "close_minute" <= 1440
    AND "max_advance_days" > 0
    AND "operating_days" IS NOT NULL AND cardinality("operating_days") > 0
    AND "operating_days" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]
);

-- 예약·사용 불가 기간: 종료 > 시작 (같으면 빈 범위라 겹침 검사를 빠져나간다)
ALTER TABLE "facility_reservation_model" ADD CONSTRAINT "facility_reservation_time_check" CHECK ("end_at" > "start_at");
ALTER TABLE "facility_unavailable_model" ADD CONSTRAINT "facility_unavailable_time_check" CHECK ("end_at" > "start_at");

-- 같은 시설의 유효한 예약(RESERVED, 삭제 안 됨)끼리 [시작, 종료) 겹침 금지 - 동시 요청의 최종 방어선 (위반 시 SQLSTATE 23P01)
-- 서비스의 트랜잭션 검사가 먼저 사용자 메시지를 만들고, 검사와 저장 사이에 끼어든 요청은 여기서 막힌다.
-- btree_gist: gist 인덱스에서 정수(facility_id)의 = 비교를 쓰기 위한 확장 (PG13+ trusted 확장이라 DB 소유자가 설치 가능)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "facility_reservation_model" ADD CONSTRAINT "facility_reservation_no_overlap"
    EXCLUDE USING gist ("facility_id" WITH =, tsrange("start_at", "end_at", '[)') WITH &&)
    WHERE ("status" = 'RESERVED' AND "deleted" = false);
