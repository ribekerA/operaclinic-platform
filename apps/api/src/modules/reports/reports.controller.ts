import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { RoleCode } from "@prisma/client";
import { ReportsService } from "./reports.service";

const REPORTS_ROLES = [RoleCode.TENANT_ADMIN, RoleCode.CLINIC_MANAGER] as const;

@Controller("reports")
@UseGuards(AuthGuard, RoleGuard)
@Roles(...REPORTS_ROLES)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("appointments/csv")
  async exportAppointments(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: { from?: string; to?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const csv = await this.reportsService.exportAppointmentsCsv(actor, query);
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agendamentos.csv"`,
    });
    return new StreamableFile(Buffer.from("﻿" + csv, "utf-8"));
  }

  @Get("patients/csv")
  async exportPatients(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: { search?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const csv = await this.reportsService.exportPatientsCsv(actor, query);
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pacientes.csv"`,
    });
    return new StreamableFile(Buffer.from("﻿" + csv, "utf-8"));
  }
}
