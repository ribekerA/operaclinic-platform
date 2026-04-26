import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./guards/auth.guard";
import { RoleGuard } from "./guards/role.guard";
import { RealtimeAuthService } from "./realtime-auth.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RoleGuard, RealtimeAuthService],
  exports: [AuthService, AuthGuard, RoleGuard, RealtimeAuthService, JwtModule],
})
export class AuthModule {}
