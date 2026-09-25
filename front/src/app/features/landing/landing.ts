import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JsonLdService } from '../../core/services/json-ld.service';
import { SITE_ORIGIN } from '../../core/services/seo.service';
import { AnimateOnScroll } from '../../shared/directives/animate-on-scroll';
import { Button } from '../../shared/ui/button/button';
import { Footer } from '../../shared/ui/footer/footer';
import { GlassCard } from '../../shared/ui/glass-card/glass-card';
import { LogoMarquee, MarqueePartner } from '../../shared/ui/logo-marquee/logo-marquee';
import { MediaAppearance, MediaCard } from '../../shared/ui/media-card/media-card';
import { ModuleCard } from '../../shared/ui/module-card/module-card';
import { NavHeader, NavLink } from '../../shared/ui/nav-header/nav-header';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

interface Pillar {
  title: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgOptimizedImage,
    RouterLink,
    NavHeader,
    Footer,
    Button,
    GlassCard,
    LogoMarquee,
    MediaCard,
    ModuleCard,
    SectionHeader,
    AnimateOnScroll,
  ],
  templateUrl: './landing.html',
})
export class Landing {
  readonly navLinks: NavLink[] = [
    { label: 'Método', href: '#metodo' },
    { label: 'A Mentora', href: '#mentora' },
    { label: 'Na mídia', href: '#midia' },
    { label: 'Trilha', href: '#trilha' },
    { label: 'Planos', href: '/planos', routerLink: '/planos' },
  ];

  readonly stats = [
    { value: '+20', label: 'Anos de Exp.' },
    { value: '+50', label: 'Empresas' },
    { value: '03', label: 'Setores' },
    { value: '01', label: 'Livro Publicado' },
  ];

  readonly pillars: Pillar[] = [
    {
      title: 'Pessoas',
      description:
        'Atração, seleção e retenção dos melhores talentos. O capital humano certo no lugar certo.',
      icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    },
    {
      title: 'Processos',
      description:
        'Desenho de fluxos claros, eficientes e escaláveis, utilizando gestão baseada em dados e People Analytics.',
      icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
    },
    {
      title: 'Cultura',
      description:
        'A importância da segurança psicológica, comunicação assertiva e pertencimento das equipes.',
      icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    },
    {
      title: 'Resultados',
      description: 'Métricas e indicadores de RH. O alinhamento entre valores e as metas do negócio.',
      icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    },
  ];

  readonly curriculum = [
    'Fundamentos do RH Estratégico', 'Diagnóstico Organizacional', 'Recrutamento e Seleção',
    'Onboarding e Integração', 'Desenvolvimento e Treinamento', 'Gestão de Desempenho',
    'Clima e Cultura', 'Cargos e Salários', 'Relações Trabalhistas',
    'Comunicação Interna', 'Indicadores e Métricas', 'Plano de Ação Final',
  ];

  /**
   * Parceiros da secao "Empresas que confiam em nosso trabalho" (Spec 011).
   *
   * A Amcom saiu e entraram Vale Automacao, Efficienza, RGM Service e Acimatec.
   * A Cronus segue na lista sem `logo` porque o arquivo ainda nao existe: ela
   * aparece escrita, como a secao inteira era antes dos logos (decisao 3).
   */
  readonly partners: MarqueePartner[] = [
    { name: 'Grupo Flexível', logo: { src: 'assets/parceiros/grupo-flexivel.svg', width: 138, height: 43 } },
    { name: 'JEC', logo: { src: 'assets/parceiros/jec.webp', width: 352, height: 458 } },
    { name: 'Magna', logo: { src: 'assets/parceiros/magna.png', width: 720, height: 145 } },
    { name: 'Geovendas', logo: { src: 'assets/parceiros/geovendas.svg', width: 229, height: 31 } },
    { name: 'Cronus' },
    { name: 'Vale Automação', logo: { src: 'assets/parceiros/vale-automacao.png', width: 1200, height: 240 } },
    { name: 'Efficienza', logo: { src: 'assets/parceiros/efficienza.png', width: 720, height: 216 } },
    { name: 'RGM Service', logo: { src: 'assets/parceiros/rgm-service.png', width: 217, height: 53 } },
    { name: 'Acimatec', logo: { src: 'assets/parceiros/acimatec.png', width: 1080, height: 308 } },
  ];

  /**
   * Aparicoes da secao "Na midia" (Spec 018). A mesma lista alimenta os cards
   * e o `subjectOf` do schema `Person`, entao o que o buscador le e o que o
   * visitante ve.
   */
  readonly media: MediaAppearance[] = [
    {
      kind: 'revista',
      title: 'Da administração à liderança: uma trajetória construída para transformar pessoas',
      outlet: 'Revista Prospere — Legado',
      dateLabel: 'nº 90 · agosto de 2026',
      datePublished: '2026-08',
      url: 'https://prosperebrasil.com.br/lidiane-delcastanher/',
      cta: 'Ler matéria',
      cover: {
        src: 'assets/midia/prospere-90-capa.webp',
        alt: 'Capa da revista Prospere nº 90, agosto de 2026, com Lidiane Delcastanher',
      },
    },
    {
      kind: 'podcast',
      title: 'Aprenda a formar lideranças de alta performance',
      outlet: 'Hapo Educação',
      dateLabel: '11 de outubro de 2025',
      datePublished: '2025-10-11',
      url: 'https://www.youtube.com/watch?v=Qvm2UtJkxA0',
      cta: 'Assistir no YouTube',
      cover: {
        src: 'assets/midia/hapo-educacao-episodio.webp',
        alt: 'Lidiane Delcastanher em entrevista ao podcast da Hapo Educação',
      },
      embed: { provider: 'youtube', id: 'Qvm2UtJkxA0' },
    },
    {
      kind: 'podcast',
      title: 'Episódio 2: Contratação e retenção de talentos',
      outlet: 'Conexão Contabilidade',
      dateLabel: '3 de julho de 2025',
      datePublished: '2025-07-03',
      url: 'https://www.instagram.com/conexaocont/reel/DLpl5hNO-XS/',
      cta: 'Assistir no Instagram',
      cover: {
        src: 'assets/midia/conexao-contabilidade-ep2.webp',
        alt: 'Lidiane Delcastanher no episódio 2 do podcast Conexão Contabilidade, sobre contratação e retenção de talentos',
      },
      embed: { provider: 'instagram', id: 'DLpl5hNO-XS' },
    },
    {
      kind: 'livro',
      title: 'Coautora da 2ª edição de "Trajetória e Cotidiano dos Líderes do Brasil"',
      outlet: 'Academia de Líderes do Brasil',
      dateLabel: '2ª edição · lançamento em São Paulo',
      datePublished: '2025-07-27',
      url: 'https://www.instagram.com/lidianedelcastanher/p/DMnzilyyXP3/',
      cta: 'Ver no Instagram',
      cover: {
        src: 'assets/midia/livro-lideres-do-brasil-2a-edicao.webp',
        alt: 'Lidiane Delcastanher segurando a 2ª edição do livro Trajetória e Cotidiano dos Líderes do Brasil',
      },
    },
  ];

  private readonly jsonLd = inject(JsonLdService);

  constructor() {
    // O `App` limpa os blocos em todo NavigationStart; a landing declara o seu
    // durante a propria ativacao, logo depois disso. Via DOCUMENT, entao o
    // bloco sai pronto no HTML prerenderizado.
    this.jsonLd.set([this.personSchema()]);
  }

  /**
   * `Person` da Lidiane com as aparicoes em `subjectOf` (Spec 018, decisao 8).
   *
   * Entra so o que e conteudo *sobre* ela e tem link confirmado: o livro e obra
   * dela, nao sobre ela, e item sem `url` nao e descrito para o buscador. Sem
   * `sameAs` enquanto os perfis do footer forem `href="#"`.
   */
  private personSchema(): Record<string, unknown> {
    const subjectOf = this.media
      .filter(item => item.kind !== 'livro' && item.url)
      .map(item =>
        item.kind === 'revista'
          ? {
              '@type': 'Article',
              headline: item.title,
              url: item.url,
              datePublished: item.datePublished,
              publisher: { '@type': 'Organization', name: item.outlet },
            }
          : {
              '@type': 'VideoObject',
              name: item.title,
              description: `${item.title} — ${item.outlet}`,
              url: item.url,
              uploadDate: item.datePublished,
              thumbnailUrl: item.cover ? `${SITE_ORIGIN}/${item.cover.src}` : undefined,
            }
      );

    return {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Lidiane Delcastanher',
      jobTitle: 'CEO',
      url: SITE_ORIGIN,
      image: `${SITE_ORIGIN}/assets/nova_mentora.jpeg`,
      worksFor: { '@type': 'Organization', name: 'Delcastanher', url: SITE_ORIGIN },
      subjectOf,
    };
  }
}
