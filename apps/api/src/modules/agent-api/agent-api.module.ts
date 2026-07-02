import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AgentApiController } from './agent-api.controller';
import { AgentApiService } from './agent-api.service';
import { AgentKeyGuard } from './guards/agent-key.guard';

@Module({
  imports: [SchedulingModule],
  controllers: [AgentApiController],
  providers: [AgentApiService, AgentKeyGuard],
})
export class AgentApiModule {}
