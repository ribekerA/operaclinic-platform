import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import type {
  PasswordMutationResponsePayload,
  PasswordResetRequestResponsePayload,
  ResolveClinicTenantsResponsePayload,
} from "@operaclinic/shared";
import { CurrentUser } from "./decorators/current-user.decorator";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RequestPasswordResetDto } from "./dto/request-password-reset.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ResolveClinicTenantsDto } from "./dto/resolve-clinic-tenants.dto";
import { SwitchClinicDto } from "./dto/switch-clinic.dto";
import { AuthGuard } from "./guards/auth.guard";
import { AuthResponse } from "./interfaces/auth-response.interface";
import { AuthenticatedUser } from "./interfaces/authenticated-user.interface";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(@Body() input: LoginDto): Promise<AuthResponse> {
    return this.authService.login(input);
  }

  @Post("clinic-tenants")
  async resolveClinicTenants(
    @Body() input: ResolveClinicTenantsDto,
  ): Promise<ResolveClinicTenantsResponsePayload> {
    return this.authService.resolveClinicTenants(input);
  }

  @Post("refresh")
  async refresh(@Body() input: RefreshTokenDto): Promise<AuthResponse> {
    return this.authService.refresh(input);
  }

  @UseGuards(AuthGuard)
  @Post("change-password")
  async changePassword(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() input: ChangePasswordDto,
  ): Promise<PasswordMutationResponsePayload> {
    return this.authService.changePassword(currentUser, input);
  }

  @Post("request-password-reset")
  async requestPasswordReset(
    @Body() input: RequestPasswordResetDto,
  ): Promise<PasswordResetRequestResponsePayload> {
    return this.authService.requestPasswordReset(input);
  }

  @Post("reset-password")
  async resetPassword(
    @Body() input: ResetPasswordDto,
  ): Promise<PasswordMutationResponsePayload> {
    return this.authService.resetPassword(input);
  }

  @UseGuards(AuthGuard)
  @Post("switch-clinic")
  async switchClinic(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() input: SwitchClinicDto,
  ): Promise<AuthResponse> {
    return this.authService.switchClinic(currentUser, input);
  }

  @UseGuards(AuthGuard)
  @Get("me")
  async me(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ user: AuthenticatedUser }> {
    const user = await this.authService.getMe(currentUser);

    return { user };
  }
}
