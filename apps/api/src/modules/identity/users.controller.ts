import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { UpdateUserRolesDto } from "./dto/update-user-roles.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserSummaryResponse } from "./interfaces/user-summary.response";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.SUPER_ADMIN, RoleCode.PLATFORM_ADMIN, RoleCode.TENANT_ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserSummaryResponse[]> {
    return this.usersService.listUsers(actor, query);
  }

  @Post()
  async createUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateUserDto,
  ): Promise<UserSummaryResponse> {
    return this.usersService.createUser(actor, input);
  }

  @Patch(":userId")
  async updateUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("userId") userId: string,
    @Body() input: UpdateUserDto,
  ): Promise<UserSummaryResponse> {
    return this.usersService.updateUser(actor, userId, input);
  }

  @Patch(":userId/roles")
  async updateUserRoles(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("userId") userId: string,
    @Body() input: UpdateUserRolesDto,
  ): Promise<UserSummaryResponse> {
    return this.usersService.updateUserRoles(actor, userId, input);
  }

  @Patch(":userId/deactivate")
  async deactivateUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("userId") userId: string,
  ): Promise<UserSummaryResponse> {
    return this.usersService.deactivateUser(actor, userId);
  }

  @Patch(":userId/reactivate")
  async reactivateUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("userId") userId: string,
  ): Promise<UserSummaryResponse> {
    return this.usersService.reactivateUser(actor, userId);
  }

  @Get(":userId")
  async getUserById(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("userId") userId: string,
  ): Promise<UserSummaryResponse> {
    return this.usersService.getUserById(actor, userId);
  }
}
