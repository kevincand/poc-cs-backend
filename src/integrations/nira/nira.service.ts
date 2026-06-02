import { Injectable, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

import { firstValueFrom } from 'rxjs';

@Injectable()
export class NiraService {
  private readonly apiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>('NIRA_API_URL')!;
  }

  async login(email: string, senha: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.apiUrl}/login`, {
          email,
          senha,
        }),
      );

      return response.data;
    } catch (error) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
  }
  async getAnalyses(token: string, query: any) {
  try {
    const response = await firstValueFrom(
      this.httpService.get(`${this.apiUrl}/analises`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },

        params: {
          query: query.query || '',
          uuidUsuarios: query.uuidUsuarios || '',
          uuidEmpresas: query.uuidEmpresas || '',
          grao: query.grao || '',
          tipoNir: query.tipoNir || '',
          nirs: query.nirs || '',
          absNumSerie: query.absNumSerie || '',

          startDate: query.startDate || '',
          endDate: query.endDate || '',

          sort: query.sort || 'criadoEm,desc',

          page: query.page || 0,
          size: query.size || 10,
          offset: query.offset || 0,
        },
      }),
    );

    return response.data;
  } catch (error: any) {
    console.error(
      'NIRA ANALYSES ERROR:',
      error.response?.data || error.message,
    );

    throw error;
  }
}
  async getSpectro(token: string, uuid: string) {
    
  try {
    const response = await firstValueFrom(
      this.httpService.get(`${this.apiUrl}/analises/espectrosByAnaliseUuid/${uuid}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }),
    );

    return response.data;
  } catch (error: any) {
    console.error(
      'NIRA w ERROR:',
      error.response?.data || error.message,
    );

    throw error;
  }
}
}