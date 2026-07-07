import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { DateTime } from 'luxon';

import axios from 'axios';

import { PrismaService } from '@/prisma/prisma.service';

import {
  analyzeSpectrumData,
  SpectralApiResponse
} from '@/analyses/utils/spectral.analysis';
import { analyzeSoybeanSpectrumData } from '@/analyses/utils/spectrum.soybean.analysis';

import { WhatsappService } from '@/shared/whatsapp.service';
import { TwilioService } from '@/shared/twilio.service';
import {
  SpectrumReportMemoryService,
  SpectrumReportItem,
} from './spectrum-report-memory.service';

import { NiraAuthService } from '@/shared/nira-auth.service';

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
    private readonly reportMemory: SpectrumReportMemoryService,
    private readonly niraAuth: NiraAuthService,
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
    const analyzedReportItems: SpectrumReportItem[] = [];

    for (const analysis of pendingAnalyses) {
      try {
        const spectrum =
          await this.fetchSpectrumByUuid(
            analysis.uuid,
          );

        const result = analysis.grao === 'SOJA'
          ? analyzeSoybeanSpectrumData(spectrum as SpectralApiResponse)
          : analyzeSpectrumData(spectrum as SpectralApiResponse);

        const structuredItem = this.buildStructuredReportItem(
          analysis,
          result,
        );

        analyzedReportItems.push(structuredItem);

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

    this.saveLatestSpectrumReportInMemory(
      start,
      end,
      analyses.length,
      pendingAnalyses.length,
      analyzedReportItems,
      reportItems,
    );
    if (!analyses.length) {
      this.logger.log(
        'Nenhuma análise encontrada no período.',
      );

      this.saveLatestSpectrumReportInMemory(
        start,
        end,
        0,
        0,
        [],
        [],
      );

      return;
    }
    if (!pendingAnalyses.length) {
      this.logger.log(
        'Nenhuma análise pendente encontrada.',
      );

      this.saveLatestSpectrumReportInMemory(
        start,
        end,
        analyses.length,
        0,
        [],
        [],
      );

      return;
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

    const response = await this.niraGet<{
      content: ExternalAnalysis[];
    }>(
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
      response?.content || [];

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
    const scoreMap = new Map(
      saved.map((item) => [
        item.analysisUuid,
        item.spectrumScore,
      ]),
    );

    return analyses.filter((analysis) => {
      const status =
        statusMap.get(analysis.uuid) ||
        'PENDENTE';

      const spectrumScore =
        scoreMap.get(analysis.uuid) ?? null;

      return status === 'PENDENTE' && spectrumScore === null;;
    });
  }

  private async fetchSpectrumByUuid(
    uuid: string,
  ) {
    const token =
      process.env.NIRA_ACCESS_TOKEN;

    const response = await this.niraGet(
      `${process.env.NIRA_API_URL}/analises/espectrosByAnaliseUuid/${uuid}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    return response;
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
      /* await this.whatsapp.sendMessage(
        to,
        chunk,
      ); */
      console.log(`Mensagem a ser enviada para ${to}:\n${chunk}`);
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
  private buildStructuredReportItem(
    analysis: ExternalAnalysis,
    result: any,
  ): SpectrumReportItem {
    const proteina = this.getResultValue(
      analysis,
      'Proteína',
    );

    const oleo = this.getResultValue(
      analysis,
      'Óleo',
    );

    const umidade = this.getResultValue(
      analysis,
      'Umidade',
    );

    const criticalFlags = result.flags.filter(
      (flag: any) => flag.severity === 'critical',
    ).length;

    const warningFlags = result.flags.filter(
      (flag: any) => flag.severity === 'warning',
    ).length;

    return {
      uuid: analysis.uuid,

      amostra: this.extractSampleName(analysis.nome),

      grao: analysis.grao,

      criadoEm: analysis.criadoEm,

      operacao: analysis.criadoPor?.nome || '-',

      placa: analysis.nirNumSerie || '-',

      proteina,

      oleo,

      umidade,

      score: result.score,

      spectrumStatus: result.status,

      flagsCount: result.flags.length,

      criticalFlags,

      warningFlags,

      flags: result.flags,
    };
  }
  private saveLatestSpectrumReportInMemory(
    start: DateTime,
    end: DateTime,
    totalInRange: number,
    totalPending: number,
    analyzedItems: SpectrumReportItem[],
    reportedMessages: string[],
  ) {
    const message =
      reportedMessages.length > 0
        ? [
          `🚨 Relatório de Espectros Críticos`,
          ``,
          `Período: ${start.toFormat('dd/MM/yyyy HH:mm')} até ${end.toFormat('dd/MM/yyyy HH:mm')}`,
          `Total sinalizado: ${reportedMessages.length}`,
          ``,
          reportedMessages
            .map(
              (item, index) =>
                `#${index + 1}\n${item}`,
            )
            .join('\n\n--------------------\n\n'),
        ].join('\n')
        : null;

    this.reportMemory.setLatestReport({
      periodStart: start.toISO() || '',

      periodEnd: end.toISO() || '',

      executedAt: DateTime.now()
        .setZone('America/Sao_Paulo')
        .toISO() || '',

      totalInRange,

      totalPending,

      totalAnalyzed: analyzedItems.length,

      totalReported: reportedMessages.length,

      items: analyzedItems,

      reportedItems: reportedMessages,

      message,
    });

    this.logger.log(
      `Relatório em memória atualizado. Analisadas: ${analyzedItems.length}. Sinalizadas: ${reportedMessages.length}.`,
    );
  }
  private async niraGet<T>(
    url: string,
    config: any = {},
    retry = true,
  ): Promise<T> {
    const token = await this.niraAuth.getToken();

    try {
      const response = await axios.get<T>(url, {
        ...config,

        headers: {
          ...(config.headers || {}),

          Authorization: `Bearer ${token}`,

          Accept: 'application/json',
        },
      });

      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401 && retry) {
        this.logger.warn(
          'Requisição NIRA retornou 401. Renovando token e tentando novamente...',
        );

        await this.niraAuth.refreshToken();

        return this.niraGet<T>(
          url,
          config,
          false,
        );
      }

      throw error;
    }
  }
}