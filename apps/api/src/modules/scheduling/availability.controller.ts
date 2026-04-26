import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { CreateSlotHoldDto } from "./dto/create-slot-hold.dto";
import { SearchAvailabilityQueryDto } from "./dto/search-availability-query.dto";
import { AvailabilitySlotResponse } from "./interfaces/availability-slot.response";
import { SlotHoldResponse } from "./interfaces/slot-hold.response";
import { SCHEDULING_OPERATION_ROLES } from "./scheduling.constants";
import { AvailabilityService } from "./availability.service";

@Controller("availability")
@UseGuards(AuthGuard, RoleGuard)
@Roles(...SCHEDULING_OPERATION_ROLES)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get("search")
  async searchAvailability(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: SearchAvailabilityQueryDto,
  ): Promise<AvailabilitySlotResponse[]> {
    return this.availabilityService.searchAvailability(actor, query);
  }

  @Post("hold")
  async createHold(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateSlotHoldDto,
  ): Promise<SlotHoldResponse> {
    return this.availabilityService.createSlotHold(actor, input);
  }
}
