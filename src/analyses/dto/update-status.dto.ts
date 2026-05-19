import { IsEnum } from 'class-validator';

export enum AnalysisStatus {
  PENDENTE = 'PENDENTE',
  ANALISADO = 'ANALISADO',
  CONFERIDO = 'CONFERIDO',
}

export class UpdateStatusDto {
  @IsEnum(AnalysisStatus)
  status: AnalysisStatus | undefined;
}