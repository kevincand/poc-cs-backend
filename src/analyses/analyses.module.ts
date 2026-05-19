import { Module } from '@nestjs/common';

import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';

import { NiraModule } from '@/integrations/nira/nira.module';

@Module({
  imports: [NiraModule],

  controllers: [AnalysesController],

  providers: [AnalysesService],
})
export class AnalysesModule {}