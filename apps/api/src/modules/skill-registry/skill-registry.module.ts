import { forwardRef, Module } from "@nestjs/common";
import { MessagingModule } from "../messaging/messaging.module";
import { PatientsModule } from "../patients/patients.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { MessagingSkillHandlersService } from "./messaging-skill-handlers.service";
import { PatientSkillHandlersService } from "./patient-skill-handlers.service";
import { SchedulingSkillHandlersService } from "./scheduling-skill-handlers.service";
import { SkillActorResolverService } from "./skill-actor-resolver.service";
import { SkillRegistryService } from "./skill-registry.service";

@Module({
  imports: [PatientsModule, SchedulingModule, forwardRef(() => MessagingModule)],
  providers: [
    SkillActorResolverService,
    PatientSkillHandlersService,
    SchedulingSkillHandlersService,
    MessagingSkillHandlersService,
    SkillRegistryService,
  ],
  exports: [SkillRegistryService],
})
export class SkillRegistryModule { }





