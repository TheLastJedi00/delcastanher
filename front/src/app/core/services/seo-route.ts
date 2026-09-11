import { ResolveFn } from '@angular/router';
import { findCourseBySlug } from '../mocks/courses.mock';
import { SeoMetadata } from './seo.service';

/**
 * Chave usada em `data` e em `resolve` nas rotas de `app.routes.ts`.
 * Rota sem esta chave cai no metadado padrao da marca.
 */
export const SEO_DATA_KEY = 'seo';

export const DEFAULT_SEO: SeoMetadata = {
  title: 'Delcastanher | Imersão RH Estratégico',
  description:
    'Estruture o RH da sua empresa do zero com a Imersão RH Estratégico da Delcastanher.',
};

/** Metadado das rotas privadas: existe para marcar `noindex` (decisao 8). */
export function privateSeo(title: string): SeoMetadata {
  return {
    title: `${title} | Delcastanher`,
    description: 'Área restrita da plataforma Delcastanher.',
    indexable: false,
  };
}

/**
 * Metadados de `/cursos/:slug`.
 *
 * Resolver, e nao `data` estatico: as campanhas de Ads apontam direto para cada
 * slug, entao o snippet precisa mudar junto com o produto. O texto vem do
 * proprio mock (`metaTitle`/`metaDescription`), que ja era a fonte usada pelo
 * componente antes desta spec.
 */
export const courseSeoResolver: ResolveFn<SeoMetadata> = route => {
  const course = findCourseBySlug(route.paramMap.get('slug'));

  if (!course) {
    // Slug fora do catalogo cai no desvio de funil da Spec 006. A pagina
    // continua util para o visitante, mas nao pode ser indexada: seria uma URL
    // sem produto competindo com as reais (decisao 7).
    return {
      title: 'Curso não encontrado | Delcastanher',
      description:
        'Este curso não está disponível. Veja os planos e cursos abertos da Delcastanher.',
      indexable: false,
    };
  }

  return {
    title: course.metaTitle,
    description: course.metaDescription,
    image: '/assets/hero.jpeg',
    type: 'article',
  };
};
