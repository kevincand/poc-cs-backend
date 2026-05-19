import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { NiraService } from './nira.service';
import { NiraController } from './nira.controller';

@Module({
  imports: [HttpModule],

  controllers: [NiraController],

  providers: [NiraService],

  exports: [NiraService],
})
export class NiraModule {}