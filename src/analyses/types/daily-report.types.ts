export type DailyReportQuery = {
  startDate: string;
  endDate: string;
  uuidUsuarios?: string;
  grao?: string;
};

export type DailyReportAnalysis = {
  uuid: string;
  nome: string;
  sampleKey: string;
  grao: string;
  criadoEm: string;

  operadorUuid?: string;
  operadorNome: string;

  nirNumSerie: string;

  proteina: number | null;
  oleo: number | null;
  umidade: number | null;

  status: string;
  spectrumScore: number | null;
  spectrumStatus: string | null;
};

export type RepeatedSampleGroup = {
  sampleKey: string;
  possibleOriginalNames: string[];
  count: number;
  firstCreatedAt: string;
  lastCreatedAt: string;
  operators: string[];
  analyses: DailyReportAnalysis[];
  insight: string;
};

export type OperatorDailySummary = {
  operadorNome: string;
  operadorUuid?: string;

  totalAnalyses: number;

  avgProteina: number | null;
  avgUmidade: number | null;
  avgOleo: number | null;

  pendingCount: number;
  analyzedCount: number;
  checkedCount: number;

  spectrumOkCount: number;
  spectrumWarningCount: number;
  spectrumBadCount: number;
  motorStoppedCount: number;

  repeatedSamplesCount: number;

  insights: string[];
};

export type DailyReportResult = {
  startDate: string;
  endDate: string;

  totalAnalyses: number;

  avgProteina: number | null;
  avgUmidade: number | null;
  avgOleo: number | null;

  spectrumOkCount: number;
  spectrumWarningCount: number;
  spectrumBadCount: number;
  motorStoppedCount: number;

  repeatedGroups: RepeatedSampleGroup[];

  operators: OperatorDailySummary[];

  insights: string[];

  analyses: DailyReportAnalysis[];

  grainSummary: GrainSummary[];
};

export type GrainSummary = {
  grao: string;

  totalAnalyses: number;

  totalSamples: number;

  avgProteina: number | null;

  avgUmidade: number | null;

  avgOleo: number | null;
};