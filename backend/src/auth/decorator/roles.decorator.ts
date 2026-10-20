import { SetMetadata } from "@nestjs/common";
import { UserRole } from "src/generated/prisma/client";

export const ROLES_KEY = 'user_roles';

// @Roles(UserRole.ADMIN)
export const Roles = (role: UserRole) => SetMetadata(ROLES_KEY, role); 
