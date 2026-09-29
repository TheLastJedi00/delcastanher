import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';

/**
 * Cache das rotas publicas sem sessao (Spec 022, decisao 16).
 *
 * - `s-maxage=60`: a CDN da Vercel guarda a resposta, e qualquer volume de
 *   acessos vira no maximo uma execucao de funcao por minuto, por rota e por
 *   regiao. E o que corta o custo de Vercel e Neon.
 * - 60 segundos e o atraso aceitavel entre publicar no painel e o site
 *   mostrar; cache mais longo exigiria purgar a CDN a cada publicacao.
 * - `stale-while-revalidate` evita que o visitante espere a renovacao, e
 *   `stale-if-error` mantem o ultimo texto bom se a API ou o banco cairem.
 */
export const PUBLIC_CACHE_CONTROL =
  'public, max-age=60, s-maxage=60, stale-while-revalidate=600, stale-if-error=86400';

/** Rotas admin: rascunho nunca pode ficar em cache compartilhado. */
export const NO_STORE = 'no-store';

/**
 * Grava o `Cache-Control` **antes** do handler.
 *
 * E um interceptor, e nao o `@Header` do Nest, porque o `@Header` so vale para
 * resposta de sucesso: o 404 dos Termos ainda nao publicados sairia sem cache,
 * e um robo pedindo a rota em laco bateria no banco a cada requisicao.
 */
@Injectable()
class CacheControlInterceptor implements NestInterceptor {
  constructor(
    private readonly value: string,
    private readonly anyOrigin = false,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();

    response.setHeader('Cache-Control', this.value);

    if (this.anyOrigin) {
      // Sobrescreve o CORS global, que reflete a origem e libera credenciais.
      // A CDN guarda uma resposta so: gravada para uma origem, ou para o build
      // (sem Origin), ela chegaria a outra com o cabecalho errado, e o
      // navegador a descartaria. Rota publica nao usa cookie, entao `*` basta.
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.removeHeader('Access-Control-Allow-Credentials');
    }

    return next.handle();
  }
}

/**
 * Cache publico da decisao 16. Vai so em rota cuja resposta **nao depende de
 * quem pede**: a rota nao pode ler cookie nem `Authorization`, senao a CDN
 * serviria a resposta de um usuario a outro. Pelo mesmo motivo, a resposta
 * vale para qualquer origem.
 */
export function PublicCache(): MethodDecorator & ClassDecorator {
  return UseInterceptors(new CacheControlInterceptor(PUBLIC_CACHE_CONTROL, true));
}

/** `no-store`, para a classe inteira de um controller administrativo. */
export function NoStore(): MethodDecorator & ClassDecorator {
  return UseInterceptors(new CacheControlInterceptor(NO_STORE));
}
