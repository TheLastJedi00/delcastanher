import { ConfigService } from '@nestjs/config';

/** Origem assumida fora de producao quando `CORS_ORIGINS` nao esta definida. */
export const DEFAULT_DEV_ORIGIN = 'http://localhost:4200';

/**
 * Origens liberadas no CORS, lidas de `CORS_ORIGINS` — uma lista separada por
 * virgula (ex.: `https://delcastanher.vercel.app,http://localhost:4200`).
 *
 * Fora de producao a variavel e opcional e cai no front local. Em producao a
 * ausencia e erro de bootstrap: cair no `localhost` silenciosamente subiria a
 * API com o front publicado bloqueado pelo navegador, um sintoma bem mais caro
 * de diagnosticar do que uma falha na subida.
 */
export function corsOrigins(config: ConfigService): string[] {
  const declared = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (declared.length > 0) {
    return [...new Set(declared)];
  }

  if (config.get<string>('NODE_ENV') === 'production') {
    throw new Error(
      'CORS_ORIGINS nao configurada. Defina a lista de origens do frontend ' +
        '(separadas por virgula) nas variaveis de ambiente do deploy.',
    );
  }

  return [DEFAULT_DEV_ORIGIN];
}
