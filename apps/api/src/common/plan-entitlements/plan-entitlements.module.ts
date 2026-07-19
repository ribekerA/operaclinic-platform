import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PlanEntitlementsController } from "./plan-entitlements.controller";
import { PlanEntitlementsService } from "./plan-entitlements.service";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [PlanEntitlementsController],
  providers: [PlanEntitlementsService],
  exports: [PlanEntitlementsService],
})
export class PlanEntitlementsModule {}
