import { Injectable } from '@nestjs/common';

export type SpectrumReportItem = {
  uuid: string;

  amostra: string;

  grao: string;

  criadoEm: string;

  operacao: string;

  placa: string;

  proteina: number | null;

  oleo: number | null;

  umidade: number | null;

  score: number;

  spectrumStatus: string;

  flagsCount: number;

  criticalFlags: number;

  warningFlags: number;

  flags: Array<{
    rule: string;
    description: string;
    severity: string;
    value?: number;
  }>;
};

export type SpectrumHourlyReport = {
  periodStart: string;

  periodEnd: string;

  executedAt: string;

  totalInRange: number;

  totalPending: number;

  totalAnalyzed: number;

  totalReported: number;

  items: SpectrumReportItem[];

  reportedItems: string[];

  message: string | null;
};

@Injectable()
export class SpectrumReportMemoryService {
  private latestReport: SpectrumHourlyReport | null = null;

  setLatestReport(report: SpectrumHourlyReport) {
    this.latestReport = report;
  }

  getLatestReport() {
    return this.latestReport;
  }

  clearLatestReport() {
    this.latestReport = null;
  }
}