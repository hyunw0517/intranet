-- CreateEnum
CREATE TYPE "CalendarEventColor" AS ENUM ('RED', 'ORANGE', 'YELLOW', 'BLUE', 'PURPLE', 'GRAY');

-- AlterTable
ALTER TABLE "post_model" ADD COLUMN     "event_color" "CalendarEventColor";

