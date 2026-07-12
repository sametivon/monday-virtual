import { Global, Module } from '@nestjs/common';
import { PlanService } from './plan.service';

/** Global so the feature guard + any module can inject PlanService directly. */
@Global()
@Module({
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
