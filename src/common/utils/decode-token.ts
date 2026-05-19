import { jwtDecode } from 'jwt-decode';

export interface TokenPayload {
  sub: string;
  userId: number;
  iat: number;
  exp: number;
}

export function decodeToken(token: string) {
  return jwtDecode<TokenPayload>(token);
}