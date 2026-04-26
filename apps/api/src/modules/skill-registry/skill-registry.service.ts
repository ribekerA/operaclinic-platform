import type {
  ClinicSkillContext,
  ClinicSkillDescriptor,
  ClinicSkillInputMap,
  ClinicSkillName,
  ClinicSkillOutputMap,
} from "@operaclinic/shared";
import { CLINIC_SKILL_CATALOG } from "@operaclinic/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { MessagingSkillHandlersService } from "./messaging-skill-handlers.service";
import { PatientSkillHandlersService } from "./patient-skill-handlers.service";
import { SchedulingSkillHandlersService } from "./scheduling-skill-handlers.service";
import { SkillActorResolverService } from "./skill-actor-resolver.service";

@Injectable()
export class SkillRegistryService {
  private readonly descriptors = new Map<ClinicSkillName, ClinicSkillDescriptor>(
    CLINIC_SKILL_CATALOG.map((descriptor) => [descriptor.name, descriptor]),
  );

  constructor(
    private readonly actorResolver: SkillActorResolverService,
    private readonly patientSkills: PatientSkillHandlersService,
    private readonly schedulingSkills: SchedulingSkillHandlersService,
    private readonly messagingSkills: MessagingSkillHandlersService,
  ) {}

  listSkills(): ClinicSkillDescriptor[] {
    return CLINIC_SKILL_CATALOG;
  }

  getSkill<TName extends ClinicSkillName>(name: TName): ClinicSkillDescriptor<TName> {
    const descriptor = this.descriptors.get(name);

    if (!descriptor) {
      throw new NotFoundException(`Skill ${name} is not registered.`);
    }

    return descriptor as ClinicSkillDescriptor<TName>;
  }

  async execute<TName extends ClinicSkillName>(
    name: TName,
    context: ClinicSkillContext,
    input: ClinicSkillInputMap[TName],
  ): Promise<ClinicSkillOutputMap[TName]> {
    const descriptor = this.getSkill(name);
    const actor = await this.actorResolver.resolve(context, descriptor.allowedRoles);

    switch (name) {
      case "find_or_merge_patient":
        return this.patientSkills.findOrMergePatient(
          actor,
          input as ClinicSkillInputMap["find_or_merge_patient"],
        ) as Promise<ClinicSkillOutputMap[TName]>;
      case "search_availability":
        return this.schedulingSkills.searchAvailability(
          actor,
          input as ClinicSkillInputMap["search_availability"],
        ) as Promise<ClinicSkillOutputMap[TName]>;
      case "hold_slot":
        return this.schedulingSkills.holdSlot(
          actor,
          input as ClinicSkillInputMap["hold_slot"],
        ) as Promise<ClinicSkillOutputMap[TName]>;
      case "create_appointment":
        return this.schedulingSkills.createAppointment(
          actor,
          input as ClinicSkillInputMap["create_appointment"],
        ) as Promise<ClinicSkillOutputMap[TName]>;
      case "confirm_appointment":
        return this.schedulingSkills.confirmAppointment(
          actor,
          input as ClinicSkillInputMap["confirm_appointment"],
        ) as Promise<ClinicSkillOutputMap[TName]>;
      case "reschedule_appointment":
        return this.schedulingSkills.rescheduleAppointment(
          actor,
          input as ClinicSkillInputMap["reschedule_appointment"],
        ) as Promise<ClinicSkillOutputMap[TName]>;
      case "cancel_appointment":
        return this.schedulingSkills.cancelAppointment(
          actor,
          input as ClinicSkillInputMap["cancel_appointment"],
        ) as Promise<ClinicSkillOutputMap[TName]>;
      case "open_handoff":
        return this.messagingSkills.openHandoff(
          actor,
          input as ClinicSkillInputMap["open_handoff"],
        ) as Promise<ClinicSkillOutputMap[TName]>;
      case "close_handoff":
        return this.messagingSkills.closeHandoff(
          actor,
          input as ClinicSkillInputMap["close_handoff"],
        ) as Promise<ClinicSkillOutputMap[TName]>;
      case "send_message":
        return this.messagingSkills.sendMessage(
          actor,
          context,
          input as ClinicSkillInputMap["send_message"],
        ) as Promise<ClinicSkillOutputMap[TName]>;
      default:
        throw new NotFoundException(`Skill ${name} is not registered.`);
    }
  }
}
