import { SetMetadata } from "@nestjs/common";
import { Role } from "src/generated/prisma/client";

export const ROLES_KEY = 'user_roles';

// @Roles(Role.ADMIN)
export const Roles = (role: Role) => SetMetadata(ROLES_KEY, role); 
