import { UserStatus } from "@prisma/client";

export class UpdateUserDto {
  fullName?: string;
  status?: UserStatus;
  password?: string;
  linkedProfessionalId?: string | null;
}
