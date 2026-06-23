import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { DateTime } from 'luxon';

import axios from 'axios';

import { PrismaService } from '@/prisma/prisma.service';

import {
  analyzeSpectrumData,
  SpectralApiResponse
} from '@/analyses/utils/spectral.analysis';

import { WhatsappService } from '@/shared/whatsapp.service';
import { TwilioService } from '@/shared/twilio.service';

type ExternalAnalysis = {
  uuid: string;
  nome: string;
  grao: string;
  criadoEm: string;
  nirNumSerie: string;
  criadoPor?: {
    nome?: string;
    email?: string;
  };
  resultadosFinais?: Array<{
    resultados?: Array<{
      nome: string;
      valor: number;
      unidadeMedida?: string;
    }>;
  }>;
};

@Injectable()
export class SpectrumCronService {
  private readonly logger = new Logger(
    SpectrumCronService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly twilio: TwilioService,
  ) { }
  @Cron('0 0 8-22 * * *', {
    timeZone: 'America/Sao_Paulo',
  })
  async handleHourlySpectrumAnalysis() {
    const now = DateTime.now().setZone(
      'America/Sao_Paulo',
    );

    const { start, end } =
      this.getAnalysisRange(now);

    this.logger.log(
      `Iniciando análise espectral: ${start.toFormat('dd/MM/yyyy HH:mm')} até ${end.toFormat('dd/MM/yyyy HH:mm')}`);

    const analyses =
      await this.fetchExternalAnalysesByPeriod(
        start,
        end,
      );

    if (!analyses.length) {
      this.logger.log(
        'Nenhuma análise encontrada no período.',
      );

      return;
    }


    const pendingAnalyses =
      await this.filterPendingAnalyses(
        analyses,
      );

    if (!pendingAnalyses.length) {
      this.logger.log(
        'Nenhuma análise pendente encontrada.',
      );

      return;
    }
    console.log(pendingAnalyses);
    const reportItems: string[] = [];

    for (const analysis of pendingAnalyses) {
      try {
        const spectrum =
          await this.fetchSpectrumByUuid(
            analysis.uuid,
          );

        const result = analyzeSpectrumData(
          spectrum as SpectralApiResponse,
        );

        await this.prisma.analysisStatusControl.upsert(
          {
            where: {
              analysisUuid: analysis.uuid,
            },

            update: {
              spectrumScore: result.score,

              spectrumStatus: result.status,
            },

            create: {
              analysisUuid: analysis.uuid,

              status: 'PENDENTE',

              spectrumScore: result.score,

              spectrumStatus: result.status,
            },
          },
        );

        const mustReport =
          result.score < 50 ||
          result.status === 'MOTOR_STOPPED';

        if (mustReport) {
          reportItems.push(
            this.buildReportItem(
              analysis,
              result,
            ),
          );
        }
      } catch (error) {
        this.logger.error(
          `Erro ao analisar espectro ${analysis.uuid}`,
          error,
        );
      }
    }

    if (reportItems.length > 0) {
      await this.sendWhatsappReport(
        start,
        end,
        reportItems,
      );
    } else {
      await this.sendWhatsappReport(
        start,
        end,
        ['Nenhum espectro crítico encontrado no período.'],
      );
    }

    this.logger.log(
      'Rotina de análise espectral finalizada.',
    );
  }
  private buildNiraDayDate(date: DateTime) {
    return `${date.toFormat('yyyy-MM-dd')}T12:00:00.000Z`;
  }

  private isAnalysisInsideRange(
    analysis: ExternalAnalysis,
    start: DateTime,
    end: DateTime,
  ) {
    const createdAt = DateTime.fromISO(
      analysis.criadoEm,
      {
        zone: 'utc',
      },
    ).setZone('America/Sao_Paulo');

    return createdAt >= start/*  && createdAt <= end */;
  }

  private getAnalysisRange(now: DateTime) {
    const hour = now.hour;

    if (hour === 8) {
      return {
        start: now.set({
          hour: 0,
          minute: 1,
          second: 0,
          millisecond: 0,
        }),

        end: now.set({
          hour: 8,
          minute: 0,
          second: 0,
          millisecond: 0,
        }),
      };
    }

    return {
      start: now.set({
        hour: hour - 1,
        minute: 1,
        second: 0,
        millisecond: 0,
      }),

      end: now.set({
        hour,
        minute: 0,
        second: 0,
        millisecond: 0,
      }),
    };
  }

  private async fetchExternalAnalysesByPeriod(
    start: DateTime,
    end: DateTime,
  ): Promise<ExternalAnalysis[]> {
    const token = process.env.NIRA_ACCESS_TOKEN;

    const apiDate = this.buildNiraDayDate(start);

    const response = await axios.get(
      `${process.env.NIRA_API_URL}/analises`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },

        params: {
          query: '',
          uuidUsuarios: '',
          uuidEmpresas: '',
          grao: '',
          tipoNir: '',
          nirs: '',
          absNumSerie: '',

          startDate: apiDate,

          endDate: apiDate,

          sort: 'criadoEm,desc',

          page: 0,

          size: 100,

          offset: 3,
        },
      },
    );

    const content: ExternalAnalysis[] =
      response.data.content || [];

    const filteredByHour = content.filter(
      (analysis) =>
        this.isAnalysisInsideRange(
          analysis,
          start,
          end,
        ),
    );

    this.logger.log(
      `API retornou ${content.length} análises da primeira página. Após filtro de horário: ${filteredByHour.length}.`,
    );

    return filteredByHour;
  }

  private async filterPendingAnalyses(
    analyses: ExternalAnalysis[],
  ) {
    const uuids = analyses.map(
      (analysis) => analysis.uuid,
    );

    const saved =
      await this.prisma.analysisStatusControl.findMany(
        {
          where: {
            analysisUuid: {
              in: uuids,
            },
          },
        },
      );

    const statusMap = new Map(
      saved.map((item) => [
        item.analysisUuid,
        item.status,
      ]),
    );

    return analyses.filter((analysis) => {
      const status =
        statusMap.get(analysis.uuid) ||
        'PENDENTE';

      return status === 'PENDENTE';
    });
  }

  private async fetchSpectrumByUuid(
    uuid: string,
  ) {
    const token =
      process.env.NIRA_ACCESS_TOKEN;

    const response = await axios.get(
      `${process.env.NIRA_API_URL}/analises/espectrosByAnaliseUuid/${uuid}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    return response.data;
  }

  private buildReportItem(
    analysis: ExternalAnalysis,
    result: any,
  ) {
    const sampleName =
      this.extractSampleName(analysis.nome);

    const proteina =
      this.getResultValue(
        analysis,
        'Proteína',
      );

    const oleo =
      this.getResultValue(
        analysis,
        'Óleo',
      );

    const umidade =
      this.getResultValue(
        analysis,
        'Umidade',
      );

    const flagsText = result.flags
      .map(
        (flag: any) =>
          `- ${flag.severity.toUpperCase()} | ${flag.rule}: ${flag.description}`,
      )
      .join('\n');

    return [
      `Amostra: ${sampleName}`,
      `Operação: ${analysis.criadoPor?.nome || '-'}`,
      `Placa/NIR: ${analysis.nirNumSerie || '-'}`,
      `Proteína: ${this.formatNumber(proteina)}%`,
      `Óleo: ${this.formatNumber(oleo)}%`,
      `Umidade: ${this.formatNumber(umidade)}%`,
      `Score espectro: ${result.score}`,
      `Status espectro: ${result.status}`,
      `Flags:`,
      flagsText || '-',
    ].join('\n');
  }

  private async sendWhatsappReport(
    start: DateTime,
    end: DateTime,
    items: string[],
  ) {
    const to =
      process.env.WHATSAPP_REPORT_TO ||
      '5563999199576';

    const message = [
      `🚨 Relatório de Espectros Críticos`,
      ``,
      `Período: ${start.toFormat('dd/MM/yyyy HH:mm')} até ${end.toFormat('dd/MM/yyyy HH:mm')}`,
      `Total sinalizado: ${items.length}`,
      ``,
      items
        .map(
          (item, index) =>
            `#${index + 1}\n${item}`,
        )
        .join('\n\n--------------------\n\n'),
    ].join('\n');

    const messageSplits = message.match(/.{1,4000}/g) || [];

    for (const chunk of messageSplits) {
      await this.whatsapp.sendMessage(
        to,
        chunk,
      ); 
      /* await this.twilio.sendMessage(
        to,
        chunk,
      ); */
    }
  }

  private getResultValue(
    analysis: ExternalAnalysis,
    name: string,
  ) {
    const results =
      analysis.resultadosFinais?.[0]
        ?.resultados || [];

    return (
      results.find(
        (item) => item.nome === name,
      )?.valor ?? null
    );
  }

  private extractSampleName(nome: string) {
    return nome
      .replace(
        /\s*[- ]*\d{2}\/\d{2}\/\d{4}.*$/,
        '',
      )
      .trim();
  }

  private formatNumber(value: number | null) {
    if (
      value === null ||
      value === undefined
    ) {
      return '-';
    }

    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}