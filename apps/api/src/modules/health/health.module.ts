import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

// OperationalObservabilityService is provided globally via ObservabilityModule
// (imported in AppModule). No need to re-provide here.
@Module({
  imports: [AgentModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
