-- CreateEnum
CREATE TYPE "AdminPermission" AS ENUM ('USERS', 'ORGANIZATION', 'BOARDS', 'FACILITIES', 'RESERVATIONS', 'APPROVAL_LINES', 'LEAVES');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "users_model" ADD COLUMN     "admin_permissions" "AdminPermission"[] DEFAULT ARRAY[]::"AdminPermission"[];
