import { Module } from "@nestjs/common";
import { DemoController } from "./demo.controller";
import { DemoVitalisResetService } from "./demo-vitalis-reset.service";

@Module({
  controllers: [DemoController],
  providers: [DemoVitalisResetService],
})
export class DemoModule {}
