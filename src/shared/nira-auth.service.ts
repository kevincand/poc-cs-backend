import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import axios from 'axios';

@Injectable()
export class NiraAuthService {
  private readonly logger = new Logger(
    NiraAuthService.name,
  );

  private accessToken: string | null =
    process.env.NIRA_ACCESS_TOKEN || null;

  private refreshingTokenPromise:
    | Promise<string>
    | null = null;

  async getToken() {
    if (this.accessToken) {
      return this.accessToken;
    }

    return this.refreshToken();
  }

  async refreshToken() {
    if (this.refreshingTokenPromise) {
      return this.refreshingTokenPromise;
    }

    this.refreshingTokenPromise =
      this.loginAndStoreToken();

    try {
      return await this.refreshingTokenPromise;
    } finally {
      this.refreshingTokenPromise = null;
    }
  }

  private async loginAndStoreToken() {
    const email = process.env.NIRA_EMAIL;

    const senha = process.env.NIRA_SENHA;

    if (!email || !senha) {
      throw new UnauthorizedException(
        'Credenciais da NIRA não configuradas no .env',
      );
    }

    this.logger.warn(
      'Token NIRA expirado. Fazendo novo login...',
    );

    const response = await axios.post(
      'https://nira.zeit.com.br/api/v1/login',
      {
        email,
        senha,
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );

    const token =
      response.data?.access_token;

    if (!token) {
      throw new UnauthorizedException(
        'Login NIRA não retornou access_token.',
      );
    }

    this.accessToken = token;

    this.logger.log(
      'Novo token NIRA salvo em memória.',
    );

    return token;
  }

  clearToken() {
    this.accessToken = null;
  }
}