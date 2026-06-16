import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PublicAvailabilityQueryDto } from "./dto/public-availability-query.dto";
import { PublicBookAppointmentDto } from "./dto/public-book-appointment.dto";
import { PublicBookingService } from "./public-booking.service";

@Controller("public")
export class PublicBookingController {
  constructor(private readonly publicBookingService: PublicBookingService) {}

  @SkipThrottle()
  @Get("clinics/slugs")
  async listActiveSlugs() {
    return this.publicBookingService.listActiveSlugs();
  }

  @Get("clinics/:slug")
  async getClinicInfo(@Param("slug") slug: string) {
    return this.publicBookingService.getClinicPublicInfo(slug);
  }

  @Get("clinics/:slug/availability")
  async searchAvailability(
    @Param("slug") slug: string,
    @Query() query: PublicAvailabilityQueryDto,
  ) {
    return this.publicBookingService.searchPublicAvailability(slug, query);
  }

  @Post("clinics/:slug/book")
  async bookAppointment(
    @Param("slug") slug: string,
    @Body() input: PublicBookAppointmentDto,
  ) {
    return this.publicBookingService.bookAppointment(slug, input);
  }
}
