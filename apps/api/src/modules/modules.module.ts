import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { PlatformModule } from "./platform/platform.module";
import { IdentityModule } from "./identity/identity.module";
import { ClinicStructureModule } from "./clinic-structure/clinic-structure.module";
import { ClinicInsightsModule } from "./clinic-insights/clinic-insights.module";
import { PatientsModule } from "./patients/patients.module";
import { ProfessionalWorkspaceModule } from "./professional-workspace/professional-workspace.module";
import { ReceptionModule } from "./reception/reception.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { CommercialModule } from "./commercial/commercial.module";
import { MessagingModule } from "./messaging/messaging.module";
import { FollowUpsModule } from "./follow-ups/follow-ups.module";
import { SkillRegistryModule } from "./skill-registry/skill-registry.module";
import { AgentModule } from "./agent/agent.module";

@Module({
  imports: [
    HealthModule,
    PlatformModule,
    IdentityModule,
    ClinicStructureModule,
    ClinicInsightsModule,
    PatientsModule,
    ProfessionalWorkspaceModule,
    SchedulingModule,
    ReceptionModule,
    CommercialModule,
    MessagingModule,
    FollowUpsModule,
    SkillRegistryModule,
    AgentModule,
  ],
})
export class ModulesModule {}
