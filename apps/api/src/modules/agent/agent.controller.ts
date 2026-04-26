import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import type {
  AgendamentoAgentResponsePayload,
  CaptacaoAgentResponsePayload,
} from "@operaclinic/shared";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AgentOrchestratorService } from "./agent-orchestrator.service";
import { ExecuteAgendamentoAgentDto } from "./dto/execute-agendamento-agent.dto";
import { ExecuteCaptacaoAgentDto } from "./dto/execute-captacao-agent.dto";

@Controller("agent")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.TENANT_ADMIN, RoleCode.CLINIC_MANAGER, RoleCode.RECEPTION)
export class AgentController {
  constructor(private readonly orchestrator: AgentOrchestratorService) {}

  @Post("captacao/execute")
  async executeCaptacao(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: ExecuteCaptacaoAgentDto,
  ): Promise<CaptacaoAgentResponsePayload> {
    return this.orchestrator.executeCaptacao(actor, input);
  }

  @Post("agendamento/execute")
  async executeAgendamento(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: ExecuteAgendamentoAgentDto,
  ): Promise<AgendamentoAgentResponsePayload> {
    return this.orchestrator.executeAgendamento(actor, input);
  }
}
