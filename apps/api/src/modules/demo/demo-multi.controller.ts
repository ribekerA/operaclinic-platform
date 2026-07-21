import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../database/prisma.service";
import { DemoAbuseProtectionService } from "./demo-abuse-protection.service";
import { DemoFounderNotificationService } from "./demo-founder-notification.service";
import { DemoMultiTenantService, CreateLeadDemoResult } from "./demo-multi-tenant.service";
import { CreateLeadDemoDto } from "./dto/create-lead-demo.dto";
import { NotifyFounderDto } from "./dto/notify-founder.dto";

@Controller("demo/multi")
export class DemoMultiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoMultiTenantService: DemoMultiTenantService,
    private readonly demoFounderNotificationService: DemoFounderNotificationService,
    private readonly abuseProtectionService: DemoAbuseProtectionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async createLeadDemo(
    @Req() request: Request,
    @Body() dto: CreateLeadDemoDto,
  ): Promise<CreateLeadDemoResult> {
    this.abuseProtectionService.assertWithinLimit(request, "create_lead_demo");
    return this.demoMultiTenantService.createLeadDemo(dto.clinicName);
  }

  @Post(":slug/notify-founder")
  @HttpCode(HttpStatus.OK)
  async notifyFounder(
    @Req() request: Request,
    @Param("slug") slug: string,
    @Body() dto: NotifyFounderDto,
  ): Promise<{ notified: boolean }> {
    this.abuseProtectionService.assertWithinLimit(request, "notify_founder");

    const demoLeadTenant = await this.prisma.demoLeadTenant.findUnique({
      where: { slug },
      select: { id: true, tenantId: true, leadClinicName: true },
    });

    if (!demoLeadTenant) {
      throw new NotFoundException("Demo tenant not found.");
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: { id: dto.appointmentId, tenantId: demoLeadTenant.tenantId },
      select: {
        startsAt: true,
        patient: { select: { fullName: true } },
        consultationType: { select: { name: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found for this demo tenant.");
    }

    await this.demoFounderNotificationService.notifyFounderOfDemoBooking({
      leadClinicName: demoLeadTenant.leadClinicName,
      patientName: appointment.patient.fullName ?? "Paciente",
      serviceName: appointment.consultationType.name,
      startsAt: appointment.startsAt,
    });

    await this.prisma.demoLeadTenant.update({
      where: { id: demoLeadTenant.id },
      data: {
        lastBookedAt: new Date(),
        founderNotifiedCount: { increment: 1 },
      },
    });

    return { notified: true };
  }
}
