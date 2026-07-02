import { IsString, Matches } from 'class-validator';

export class LookupAppointmentsDto {
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone must be in E.164 format (e.g. +5511999998888)',
  })
  phone!: string;
}
