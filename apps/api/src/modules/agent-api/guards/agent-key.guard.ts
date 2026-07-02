import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AgentApiException, AgentErrorCode } from '../agent-api.errors';

export const AGENT_TENANT_ID_KEY = '__agentTenantId__';

@Injectable()
export class AgentKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & Record<string, unknown>>();
    const incomingKey = (request.headers as Record<string, string | undefined>)['x-agent-key'];
    const validKey = this.config.get<string>('AGENT_API_KEY');
    const tenantId = this.config.get<string>('AGENT_API_TENANT_ID');

    if (!validKey || !tenantId) {
      throw new AgentApiException(
        AgentErrorCode.UNAUTHORIZED,
        'Agent API is not configured on this server.',
        503,
      );
    }

    if (!incomingKey || incomingKey !== validKey) {
      throw new AgentApiException(
        AgentErrorCode.UNAUTHORIZED,
        'Invalid or missing X-Agent-Key header.',
        401,
      );
    }

    request[AGENT_TENANT_ID_KEY] = tenantId;
    return true;
  }
}
