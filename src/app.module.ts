import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { NiraModule } from './integrations/nira/nira.module';
import { AnalysesModule } from './analyses/analyses.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,

    NiraModule,

    AnalysesModule,
  ],
})
export class AppModule {}