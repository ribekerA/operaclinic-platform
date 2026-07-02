import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AgentApiService } from './agent-api.service';
import { AgentApiExceptionFilter } from './filters/agent-api-exception.filter';
import { AGENT_TENANT_ID_KEY, AgentKeyGuard } from './guards/agent-key.guard';
import { CancelAgentAppointmentDto } from './dto/cancel-agent-appointment.dto';
import { CreateAgentAppointmentDto } from './dto/create-agent-appointment.dto';
import { GetAvailabilityDto } from './dto/get-availability.dto';
import { LookupAppointmentsDto } from './dto/lookup-appointments.dto';
import { RescheduleAgentAppointmentDto } from './dto/reschedule-agent-appointment.dto';

type AgentRequest = Request & Record<string, unknown>;

@Controller('api/agent/v1')
@UseGuards(AgentKeyGuard)
@UseFilters(AgentApiExceptionFilter)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AgentApiController {
  constructor(private readonly agentApiService: AgentApiService) {}

  @Get('availability')
  async getAvailability(@Req() req: AgentRequest, @Query() query: GetAvailabilityDto) {
    return this.agentApiService.getAvailability(req[AGENT_TENANT_ID_KEY] as string, query);
  }

  @Post('appointments')
  async createAppointment(@Req() req: AgentRequest, @Body() body: CreateAgentAppointmentDto) {
    return this.agentApiService.createAppointment(req[AGENT_TENANT_ID_KEY] as string, body);
  }

  // Must be declared before :id routes so Express matches literal "lookup" first
  @Get('appointments/lookup')
  async lookupAppointments(@Req() req: AgentRequest, @Query() query: LookupAppointmentsDto) {
    return this.agentApiService.lookupAppointments(req[AGENT_TENANT_ID_KEY] as string, query.phone);
  }

  @Patch('appointments/:id/reschedule')
  async rescheduleAppointment(
    @Req() req: AgentRequest,
    @Param('id') id: string,
    @Body() body: RescheduleAgentAppointmentDto,
  ) {
    return this.agentApiService.rescheduleAppointment(req[AGENT_TENANT_ID_KEY] as string, id, body);
  }

  @Post('appointments/:id/cancel')
  async cancelAppointment(
    @Req() req: AgentRequest,
    @Param('id') id: string,
    @Body() body: CancelAgentAppointmentDto,
  ) {
    return this.agentApiService.cancelAppointment(req[AGENT_TENANT_ID_KEY] as string, id, body);
  }
}
