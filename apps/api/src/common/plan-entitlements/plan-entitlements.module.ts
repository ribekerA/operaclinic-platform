import { Global, Module } from "@nestjs/common";
import { PlanEntitlementsService } from "./plan-entitlements.service";

@Global()
@Module({
  providers: [PlanEntitlementsService],
  exports: [PlanEntitlementsService],
})
export class PlanEntitlementsModule {}
