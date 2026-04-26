import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { SkillRegistryModule } from "../skill-registry/skill-registry.module";
import { AgentController } from "./agent.controller";
import { AgentRuntimeService } from "./agent-runtime.service";
import { AgentOrchestratorService } from "./agent-orchestrator.service";
import { AgentMessageBridgeService } from "./agent-message-bridge.service";
import { CaptacaoAgentService } from "./agents/captacao-agent.service";
import { AgendamentoAgentService } from "./agents/agendamento-agent.service";
// Base infrastructure services
import { ConversationContextResolverService } from "./services/conversation-context-resolver.service";
import { IntentRouterService } from "./services/intent-router.service";
import { GuardrailvService } from "./services/guardrails.service";
import { EscalationPolicyService } from "./services/escalation-policy.service";
import { SkillExecutorService } from "./services/skill-executor.service";
import { AgentObservabilityService } from "./services/agent-observability.service";

@Module({
  imports: [AuthModule, SkillRegistryModule],
  controllers: [AgentController],
  providers: [
    // Base infrastructure - order matters (dependencies)
    ConversationContextResolverService,
    IntentRouterService,
    GuardrailvService,
    EscalationPolicyService,
    AgentObservabilityService,
    SkillExecutorService,
    // Runtime services
    AgentRuntimeService,
    AgentOrchestratorService,
    AgentMessageBridgeService,
    // Agent implementations
    CaptacaoAgentService,
    AgendamentoAgentService,
  ],
  exports: [
    // Base infrastructure
    ConversationContextResolverService,
    IntentRouterService,
    GuardrailvService,
    EscalationPolicyService,
    AgentObservabilityService,
    SkillExecutorService,
    // Runtime services
    AgentRuntimeService,
    AgentOrchestratorService,
    AgentMessageBridgeService,
    CaptacaoAgentService,
    AgendamentoAgentService,
  ],
})
export class AgentModule {}
