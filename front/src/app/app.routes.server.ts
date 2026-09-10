import { RenderMode, ServerRoute } from '@angular/ssr';
import { COURSES } from './core/mocks/courses.mock';

/**
 * Estrategia de renderizacao por rota (Spec 009, decisoes 1, 2 e 8).
 *
 * A vitrine e prerenderizada em build (`outputMode: 'static'`): os crawlers de
 * WhatsApp, LinkedIn e Facebook nao executam JavaScript, entao meta tags e
 * JSON-LD injetados em runtime nunca chegariam a eles. Tudo o que e publico
 * sai do build como HTML pronto.
 *
 * A area logada fica em `Client`: nao ha nada a ganhar em busca organica e ha
 * o que perder — alem de ser conteudo que depende de sessao, que o build nao
 * tem como resolver.
 *
 * A ordem importa: o primeiro padrao que casa vence.
 */
export const serverRoutes: ServerRoute[] = [
  // --- Area privada: renderizada apenas no navegador ---
  { path: 'ava', renderMode: RenderMode.Client },
  { path: 'ava/**', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'onboarding', renderMode: RenderMode.Client },
  // O checkout depende da jornada em memoria (Spec 007) — prerenderizar as
  // etapas geraria telas que so redirecionam.
  { path: 'checkout/**', renderMode: RenderMode.Client },

  // --- Vitrine: HTML pronto em build ---
  {
    path: 'cursos/:slug',
    renderMode: RenderMode.Prerender,
    // Enquanto o catalogo vive em mock, ele e a fonte dos slugs. Quando a API
    // de cursos existir, esta funcao passa a busca-los de la.
    getPrerenderParams: async () => Object.keys(COURSES).map(slug => ({ slug })),
  },

  // Curinga: cobre '', 'planos', 'login', 'certificado/verificar', as paginas
  // legais e a 404.
  { path: '**', renderMode: RenderMode.Prerender },
];
