import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { ProcedureProtocolsController } from "./procedure-protocols.controller";
import { ProcedureProtocolsService } from "./procedure-protocols.service";

@Module({
  imports: [AuthModule],
  controllers: [ProcedureProtocolsController],
  providers: [ProcedureProtocolsService],
})
export class ProcedureProtocolsModule {}
