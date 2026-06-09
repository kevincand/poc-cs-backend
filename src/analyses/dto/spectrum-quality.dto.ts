import {
  IsEnum,
  IsInt,
  Max,
  Min,
} from 'class-validator';

export enum SpectrumStatus {
  OK = 'OK',
  WARNING = 'WARNING',
  MOTOR_STOPPED = 'MOTOR_STOPPED',
  BAD_SPECTRUM = 'BAD_SPECTRUM',
}

export class UpdateSpectrumQualityDto {
  @IsInt()
  @Min(0)
  @Max(100)
  spectrumScore: number | undefined;

  @IsEnum(SpectrumStatus)
  spectrumStatus: SpectrumStatus | undefined;
}