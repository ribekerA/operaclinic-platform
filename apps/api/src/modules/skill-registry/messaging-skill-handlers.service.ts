import type {
  ClinicSkillContext,
  CloseHandoffSkillInput,
  MessagingHandoffPayload,
  MessagingThreadDetailPayload,
  OpenHandoffSkillInput,
  SendMessageSkillInput,
} from "@operaclinic/shared";
import { Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { HandoffRequestsService } from "../messaging/handoff-requests.service";
import { MessageThreadsService } from "../messaging/message-threads.service";

@Injectable()
export class MessagingSkillHandlersService {
  constructor(
    private readonly handoffRequestsService: HandoffRequestsService,
    private readonly messageThreadsService: MessageThreadsService,
  ) {}

  async openHandoff(
    actor: AuthenticatedUser,
    input: OpenHandoffSkillInput,
  ): Promise<MessagingHandoffPayload> {
    return this.handoffRequestsService.openHandoff(actor, {
      threadId: input.threadId,
      reason: input.reason,
      note: input.note,
      templateId: input.templateId,
      assignedToUserId: input.assignedToUserId ?? undefined,
    });
  }

  async closeHandoff(
    actor: AuthenticatedUser,
    input: CloseHandoffSkillInput,
  ): Promise<MessagingHandoffPayload> {
    return this.handoffRequestsService.closeHandoff(actor, input.handoffId, {
      note: input.note,
      resolveThread: input.resolveThread,
    });
  }

  async sendMessage(
    actor: AuthenticatedUser,
    context: ClinicSkillContext,
    input: SendMessageSkillInput,
  ): Promise<MessagingThreadDetailPayload> {
    return this.messageThreadsService.sendMessage(actor, input.threadId, {
      text: input.text,
    }, {
      source: context.source === "AGENT" ? "AGENT" : "HUMAN",
      correlationId: context.correlationId,
      metadata: input.metadata,
    });
  }
}
