import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

/**
 * Dominio canonico da vitrine.
 *
 * O canonical e a URL absoluta precisam de um host, e o prerender roda no Node,
 * onde nao existe `location`. Quando o dominio proprio entrar no ar, e esta
 * constante que muda.
 */
export const SITE_ORIGIN = 'https://delcastanher.vercel.app';

const SITE_NAME = 'Delcastanher';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/assets/hero.jpeg`;

export interface SeoMetadata {
  title: string;
  description: string;
  /** Caminho absoluto da imagem de compartilhamento, ou URL completa. */
  image?: string;
  /** `false` marca a rota como `noindex, nofollow` (decisao 8). */
  indexable?: boolean;
  /** Tipo Open Graph; `article` para conteudo, `website` para o resto. */
  type?: 'website' | 'article';
}

/**
 * Aplica os metadados de uma rota (Spec 009, decisoes 1, 8 e 12).
 *
 * Ponto unico de escrita: antes desta spec, `plans`, `course-detail`,
 * `checkout` e `certificado-verificar` chamavam `Title`/`Meta` cada um do seu
 * jeito e nenhum deles emitia Open Graph ou canonical. Concentrar aqui evita
 * que uma rota nova nasca sem metadados — e que duas escrevam tags
 * concorrentes na mesma navegacao.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  apply(metadata: SeoMetadata, url: string): void {
    const canonical = this.absoluteUrl(url);
    const image = this.absoluteUrl(metadata.image ?? DEFAULT_IMAGE);
    const indexable = metadata.indexable ?? true;

    this.title.setTitle(metadata.title);
    this.meta.updateTag({ name: 'description', content: metadata.description });

    // `robots.txt` impede rastreamento, nao indexacao por link externo: a meta
    // e o unico sinal que cobre uma URL privada divulgada por terceiro.
    this.meta.updateTag({
      name: 'robots',
      content: indexable ? 'index, follow' : 'noindex, nofollow',
    });

    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:type', content: metadata.type ?? 'website' });
    this.meta.updateTag({ property: 'og:title', content: metadata.title });
    this.meta.updateTag({ property: 'og:description', content: metadata.description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:locale', content: 'pt_BR' });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: metadata.title });
    this.meta.updateTag({ name: 'twitter:description', content: metadata.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setCanonical(indexable ? canonical : null);
  }

  /**
   * Uma pagina nao indexavel nao declara canonical: apontar para si mesma
   * enquanto pede `noindex` manda dois sinais contraditorios ao buscador.
   */
  private setCanonical(href: string | null): void {
    const head = this.document.head;
    const existing = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (!href) {
      existing?.remove();

      return;
    }

    const link = existing ?? this.document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', href);

    if (!existing) {
      head.appendChild(link);
    }
  }

  private absoluteUrl(value: string): string {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }

    // A query string nao entra no canonical: `?utm_source=...` de campanha
    // criaria uma URL canonica diferente para cada anuncio.
    const path = value.split('?')[0].split('#')[0];
    const normalized = path.startsWith('/') ? path : `/${path}`;

    return normalized === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${normalized.replace(/\/$/, '')}`;
  }
}
