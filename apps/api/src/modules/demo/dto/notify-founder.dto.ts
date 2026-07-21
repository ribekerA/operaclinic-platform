import { IsUUID } from "class-validator";

export class NotifyFounderDto {
  @IsUUID()
  appointmentId!: string;
}
