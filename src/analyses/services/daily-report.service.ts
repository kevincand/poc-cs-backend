import {
  Injectable,
  Logger,
} from '@nestjs/common';

import axios from 'axios';

import { DateTime } from 'luxon';

import { PrismaService } from '@/prisma/prisma.service';

import {
  DailyReportAnalysis,
  DailyReportQuery,
  DailyReportResult,
  OperatorDailySummary,
  RepeatedSampleGroup,
} from '../types/daily-report.types';

type ExternalAnalysis = {
  uuid: string;
  nome: string;
  grao: string;
  criadoEm: string;

  criadoPor?: {
    uuid?: string;
    nome?: string;
    email?: string;
  };

  nirNumSerie?: string;

  resultadosFinais?: Array<{
    resultados?: Array<{
      nome: string;
      valor: number;
      unidadeMedida?: string;
    }>;
  }>;
};

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(
    DailyReportService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async generateDailyReport(
    query: DailyReportQuery,
  ): Promise<DailyReportResult> {
    const analysesFromApi =
      await this.fetchAnalysesFromNira(query);

    const analyses =
      await this.mapWithLocalStatus(
        analysesFromApi,
      );

    const repeatedGroups =
      this.findRepeatedSamples(analyses);

    const operators =
      this.buildOperatorSummaries(
        analyses,
        repeatedGroups,
      );

    const result: DailyReportResult = {
      date: query.date,

      totalAnalyses: analyses.length,

      avgProteina: this.average(
        analyses.map((item) => item.proteina),
      ),

      avgUmidade: this.average(
        analyses.map((item) => item.umidade),
      ),

      avgOleo: this.average(
        analyses.map((item) => item.oleo),
      ),

      spectrumOkCount: analyses.filter(
        (item) => item.spectrumStatus === 'OK',
      ).length,

      spectrumWarningCount: analyses.filter(
        (item) =>
          item.spectrumStatus === 'WARNING',
      ).length,

      spectrumBadCount: analyses.filter(
        (item) =>
          item.spectrumStatus === 'BAD_SPECTRUM',
      ).length,

      motorStoppedCount: analyses.filter(
        (item) =>
          item.spectrumStatus === 'MOTOR_STOPPED',
      ).length,

      repeatedGroups,

      operators,

      insights: this.buildGeneralInsights(
        analyses,
        repeatedGroups,
        operators,
      ),

      analyses,
    };

    return result;
  }

  private async fetchAnalysesFromNira(
    query: DailyReportQuery,
  ): Promise<ExternalAnalysis[]> {
    const token = process.env.NIRA_ACCESS_TOKEN;

    const apiDate = `${query.date}T12:00:00.000Z`;

    const result: ExternalAnalysis[] = [];

    let page = 0;

    let totalPages = 1;

    while (page < totalPages) {
      const response = await axios.get(
        'https://nira.zeit.com.br/api/v1/analises',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },

          params: {
            query: '',

            uuidUsuarios:
              query.uuidUsuarios || '',

            uuidEmpresas: '',

            grao: query.grao || '',

            tipoNir: '',

            nirs: '',

            absNumSerie: '',

            startDate: apiDate,

            endDate: apiDate,

            sort: 'criadoEm,desc',

            page,

            size: 100,

            offset: 3,
          },
        },
      );

      result.push(
        ...(response.data.content || []),
      );

      totalPages =
        response.data.totalPages || 1;

      page++;
    }

    this.logger.log(
      `Relatório diário: ${result.length} análises carregadas da API NIRA.`,
    );

    return result;
  }

  private async mapWithLocalStatus(
    externalAnalyses: ExternalAnalysis[],
  ): Promise<DailyReportAnalysis[]> {
    const uuids = externalAnalyses.map(
      (item) => item.uuid,
    );

    const localStatuses =
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
      localStatuses.map((item) => [
        item.analysisUuid,
        item,
      ]),
    );

    return externalAnalyses.map((item) => {
      const local = statusMap.get(item.uuid);

      return {
        uuid: item.uuid,

        nome: item.nome,

        sampleKey: this.normalizeSampleName(
          item.nome,
        ),

        grao: item.grao,

        criadoEm: item.criadoEm,

        operadorUuid: item.criadoPor?.uuid,

        operadorNome:
          item.criadoPor?.nome || '-',

        nirNumSerie: item.nirNumSerie || '-',

        proteina: this.getResultValue(
          item,
          'Proteína',
        ),

        oleo: this.getResultValue(
          item,
          'Óleo',
        ),

        umidade: this.getResultValue(
          item,
          'Umidade',
        ),

        status: local?.status || 'PENDENTE',

        spectrumScore:
          local?.spectrumScore ?? null,

        spectrumStatus:
          local?.spectrumStatus ?? null,
      };
    });
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

  private normalizeSampleName(nome: string) {
    return nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\d{2}\/\d{2}\/\d{4}.*/, '')
      .replace(/•.*/, '')
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }

  private findRepeatedSamples(
    analyses: DailyReportAnalysis[],
  ): RepeatedSampleGroup[] {
    const sorted = [...analyses].sort(
      (a, b) =>
        new Date(a.criadoEm).getTime() -
        new Date(b.criadoEm).getTime(),
    );

    const groups: DailyReportAnalysis[][] = [];

    for (const analysis of sorted) {
      const createdAt = DateTime.fromISO(
        analysis.criadoEm,
        {
          zone: 'utc',
        },
      );

      let matchedGroup:
        | DailyReportAnalysis[]
        | undefined;

      for (const group of groups) {
        const first = group[0];

        const firstCreatedAt =
          DateTime.fromISO(first.criadoEm, {
            zone: 'utc',
          });

        const minutesDiff = Math.abs(
          createdAt.diff(
            firstCreatedAt,
            'minutes',
          ).minutes,
        );

        const similarity =
          this.similarity(
            analysis.sampleKey,
            first.sampleKey,
          );

        const sameOperator =
          analysis.operadorUuid &&
          first.operadorUuid &&
          analysis.operadorUuid ===
            first.operadorUuid;

        const sameOrSimilarSample =
          analysis.sampleKey ===
            first.sampleKey ||
          similarity >= 0.86;

        const closeTime =
          minutesDiff <= 90;

        if (
          sameOrSimilarSample &&
          closeTime &&
          sameOperator
        ) {
          matchedGroup = group;
          break;
        }
      }

      if (matchedGroup) {
        matchedGroup.push(analysis);
      } else {
        groups.push([analysis]);
      }
    }

    return groups
      .filter((group) => group.length > 1)
      .map((group) =>
        this.buildRepeatedGroup(group),
      );
  }

  private buildRepeatedGroup(
    group: DailyReportAnalysis[],
  ): RepeatedSampleGroup {
    const sorted = [...group].sort(
      (a, b) =>
        new Date(a.criadoEm).getTime() -
        new Date(b.criadoEm).getTime(),
    );

    const operators = [
      ...new Set(
        sorted.map(
          (item) => item.operadorNome,
        ),
      ),
    ];

    const names = [
      ...new Set(
        sorted.map((item) => item.nome),
      ),
    ];

    return {
      sampleKey: sorted[0].sampleKey,

      possibleOriginalNames: names,

      count: sorted.length,

      firstCreatedAt: sorted[0].criadoEm,

      lastCreatedAt:
        sorted[sorted.length - 1].criadoEm,

      operators,

      analyses: sorted,

      insight:
        this.buildRepeatedInsight(sorted),
    };
  }

  private buildRepeatedInsight(
    group: DailyReportAnalysis[],
  ) {
    const hasBadSpectrum = group.some(
      (item) =>
        item.spectrumStatus === 'BAD_SPECTRUM' ||
        item.spectrumStatus ===
          'MOTOR_STOPPED',
    );

    const hasWarning = group.some(
      (item) =>
        item.spectrumStatus === 'WARNING',
    );

    const proteinValues = group
      .map((item) => item.proteina)
      .filter(
        (value): value is number =>
          value !== null &&
          value !== undefined,
      );

    const proteinRange =
      proteinValues.length > 1
        ? Math.max(...proteinValues) -
          Math.min(...proteinValues)
        : 0;

    if (hasBadSpectrum) {
      return 'A amostra foi repetida e apresentou espectro crítico ou motor parado. Ação sugerida: verificar rotação do equipamento, limpeza da janela óptica e preparo da amostra antes de aceitar novo resultado.';
    }

    if (hasWarning) {
      return 'A amostra foi repetida e teve alerta espectral. Ação sugerida: revisar padrão de preparo, homogeneização e posicionamento da amostra.';
    }

    if (proteinRange >= 1) {
      return 'A amostra foi repetida com diferença relevante de proteína entre leituras. Ação sugerida: conferir homogeneização, identificação da amostra e possível erro de digitação.';
    }

    return 'A amostra possui repetições próximas no tempo. Pode indicar conferência operacional, dúvida no resultado ou reanálise por procedimento interno.';
  }

  private buildOperatorSummaries(
    analyses: DailyReportAnalysis[],
    repeatedGroups: RepeatedSampleGroup[],
  ): OperatorDailySummary[] {
    const operatorMap = new Map<
      string,
      DailyReportAnalysis[]
    >();

    for (const analysis of analyses) {
      const key =
        analysis.operadorUuid ||
        analysis.operadorNome;

      if (!operatorMap.has(key)) {
        operatorMap.set(key, []);
      }

      operatorMap.get(key)!.push(analysis);
    }

    return Array.from(operatorMap.entries()).map(
      ([key, items]) => {
        const operatorRepeatedCount =
          repeatedGroups.filter((group) =>
            group.analyses.some(
              (analysis) =>
                (analysis.operadorUuid ||
                  analysis.operadorNome) === key,
            ),
          ).length;

        const summary: OperatorDailySummary = {
          operadorNome:
            items[0]?.operadorNome || '-',

          operadorUuid:
            items[0]?.operadorUuid,

          totalAnalyses: items.length,

          avgProteina: this.average(
            items.map(
              (item) => item.proteina,
            ),
          ),

          avgUmidade: this.average(
            items.map(
              (item) => item.umidade,
            ),
          ),

          avgOleo: this.average(
            items.map((item) => item.oleo),
          ),

          pendingCount: items.filter(
            (item) =>
              item.status === 'PENDENTE',
          ).length,

          analyzedCount: items.filter(
            (item) =>
              item.status === 'ANALISADO',
          ).length,

          checkedCount: items.filter(
            (item) =>
              item.status === 'CONFERIDO',
          ).length,

          spectrumOkCount: items.filter(
            (item) =>
              item.spectrumStatus === 'OK',
          ).length,

          spectrumWarningCount: items.filter(
            (item) =>
              item.spectrumStatus ===
              'WARNING',
          ).length,

          spectrumBadCount: items.filter(
            (item) =>
              item.spectrumStatus ===
              'BAD_SPECTRUM',
          ).length,

          motorStoppedCount: items.filter(
            (item) =>
              item.spectrumStatus ===
              'MOTOR_STOPPED',
          ).length,

          repeatedSamplesCount:
            operatorRepeatedCount,

          insights: [],
        };

        summary.insights =
          this.buildOperatorInsights(summary);

        return summary;
      },
    ).sort(
      (a, b) =>
        b.totalAnalyses - a.totalAnalyses,
    );
  }

  private buildOperatorInsights(
    summary: OperatorDailySummary,
  ) {
    const insights: string[] = [];

    if (summary.motorStoppedCount > 0) {
      insights.push(
        `Foram encontradas ${summary.motorStoppedCount} análise(s) com suspeita de motor parado. Verificar rotação, manutenção e procedimento de preparo.`,
      );
    }

    if (summary.spectrumBadCount > 0) {
      insights.push(
        `Foram encontradas ${summary.spectrumBadCount} análise(s) com espectro crítico. Priorizar revisão dessas amostras antes de validar o resultado.`,
      );
    }

    if (summary.spectrumWarningCount >= 3) {
      insights.push(
        `Há várias análises com atenção no mesmo operador. Pode indicar padrão de preparo, limpeza do equipamento ou condição da amostra.`,
      );
    }

    if (summary.repeatedSamplesCount >= 3) {
      insights.push(
        `Há muitas repetições de amostras. Verificar se as reanálises estão ocorrendo por dúvida operacional, falha no equipamento ou erro de identificação.`,
      );
    }

    if (!insights.length) {
      insights.push(
        'Operação sem sinais críticos relevantes no período selecionado.',
      );
    }

    return insights;
  }

  private buildGeneralInsights(
    analyses: DailyReportAnalysis[],
    repeatedGroups: RepeatedSampleGroup[],
    operators: OperatorDailySummary[],
  ) {
    const insights: string[] = [];

    const total = analyses.length;

    const badCount = analyses.filter(
      (item) =>
        item.spectrumStatus === 'BAD_SPECTRUM',
    ).length;

    const motorCount = analyses.filter(
      (item) =>
        item.spectrumStatus === 'MOTOR_STOPPED',
    ).length;

    const warningCount = analyses.filter(
      (item) =>
        item.spectrumStatus === 'WARNING',
    ).length;

    if (!total) {
      return [
        'Nenhuma análise encontrada para os filtros selecionados.',
      ];
    }

    if (motorCount > 0) {
      insights.push(
        `${motorCount} análise(s) com suspeita de motor parado. Ação sugerida: verificar rotação do equipamento, motor, preparo da amostra e repetir a leitura.`,
      );
    }

    if (badCount > 0) {
      insights.push(
        `${badCount} análise(s) com espectro crítico. Ação sugerida: revisar antes de aceitar o resultado e priorizar amostras com score baixo.`,
      );
    }

    if (warningCount / total >= 0.25) {
      insights.push(
        `Mais de 25% das análises ficaram com atenção. Isso pode indicar instabilidade operacional, limpeza do equipamento, problema de preparo ou variação incomum da matéria-prima.`,
      );
    }

    if (repeatedGroups.length > 0) {
      insights.push(
        `Foram encontrados ${repeatedGroups.length} grupo(s) de possíveis reanálises. Repetições próximas no tempo podem indicar dúvida no resultado, erro de digitação, reprocesso ou falha de leitura.`,
      );
    }

    const operatorWithMostBad =
      operators
        .filter(
          (op) =>
            op.spectrumBadCount > 0 ||
            op.motorStoppedCount > 0,
        )
        .sort(
          (a, b) =>
            b.spectrumBadCount +
            b.motorStoppedCount -
            (a.spectrumBadCount +
              a.motorStoppedCount),
        )[0];

    if (operatorWithMostBad) {
      insights.push(
        `A operação com maior concentração de espectros críticos foi ${operatorWithMostBad.operadorNome}. Ação sugerida: avaliar procedimento local, equipamento utilizado e padrão de preparo.`,
      );
    }

    if (!insights.length) {
      insights.push(
        'O dia não apresentou sinais operacionais críticos relevantes. Manter acompanhamento normal.',
      );
    }

    return insights;
  }

  private average(
    values: Array<number | null | undefined>,
  ) {
    const valid = values.filter(
      (value): value is number =>
        value !== null &&
        value !== undefined &&
        !Number.isNaN(value),
    );

    if (!valid.length) {
      return null;
    }

    return (
      valid.reduce(
        (sum, value) => sum + value,
        0,
      ) / valid.length
    );
  }

  private levenshtein(
    a: string,
    b: string,
  ) {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (
          b.charAt(i - 1) ===
          a.charAt(j - 1)
        ) {
          matrix[i][j] =
            matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  private similarity(a: string, b: string) {
    if (!a || !b) {
      return 0;
    }

    const distance = this.levenshtein(
      a,
      b,
    );

    const maxLength = Math.max(
      a.length,
      b.length,
    );

    if (!maxLength) {
      return 1;
    }

    return 1 - distance / maxLength;
  }
}