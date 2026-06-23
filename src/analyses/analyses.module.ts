import { Module } from '@nestjs/common';

import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';

import { NiraModule } from '@/integrations/nira/nira.module';

import { SpectrumCronService } from './services/spectrum-cron.service';
import { WhatsappService } from '@/shared/whatsapp.service';
import { TwilioService } from '@/shared/twilio.service';

@Module({
  imports: [NiraModule],

  controllers: [AnalysesController],

  providers: [AnalysesService, SpectrumCronService, WhatsappService, TwilioService],
})
export class AnalysesModule {}