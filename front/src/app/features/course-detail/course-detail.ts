import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { findCourseBySlug } from '../../core/mocks/courses.mock';
import { isPlaceholder } from '../../core/mocks/placeholders';
import { AnalyticsService } from '../../core/services/analytics.service';
import { JsonLdService } from '../../core/services/json-ld.service';
import { SITE_ORIGIN } from '../../core/services/seo.service';
import { AnimateOnScroll } from '../../shared/directives/animate-on-scroll';
import { Accordion, AccordionItem } from '../../shared/ui/accordion/accordion';
import { Button } from '../../shared/ui/button/button';
import { Footer } from '../../shared/ui/footer/footer';
import { GlassCard } from '../../shared/ui/glass-card/glass-card';
import { ScarcityBanner } from '../../shared/ui/scarcity-banner/scarcity-banner';
import { NavHeader, NavLink } from '../../shared/ui/nav-header/nav-header';
import { PlaceholderText } from '../../shared/ui/placeholder-text/placeholder-text';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

@Component({
  selector: 'app-course-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NavHeader,
    Accordion,
    Footer,
    Button,
    GlassCard,
    ScarcityBanner,
    SectionHeader,
    PlaceholderText,
    AnimateOnScroll,
  ],
  templateUrl: './course-detail.html',
})
export class CourseDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly analytics = inject(AnalyticsService);
  private readonly jsonLd = inject(JsonLdService);

  /** Ancoras da propria pagina do curso; "Planos" navega pelo router. */
  protected readonly navLinks: NavLink[] = [
    { label: 'O que você aprende', href: '#resultados' },
    { label: 'Grade', href: '#grade' },
    { label: 'Investimento', href: '#investimento' },
    { label: 'Planos', href: '/planos', routerLink: '/planos' },
  ];

  private readonly slug = toSignal(this.route.paramMap.pipe(map(params => params.get('slug'))), {
    initialValue: null,
  });

  /** null quando o slug nao existe no mock — o template cai no fallback. */
  protected readonly course = computed(() => findCourseBySlug(this.slug()));

  /** true enquanto o gateway de pagamento nao for definido. */
  protected readonly checkoutPending = computed(() =>
    isPlaceholder(this.course()?.offer.checkoutUrl)
  );

  /**
   * Destino dos CTAs de compra: o mockup interno de checkout (Spec 007).
   * `offer.checkoutUrl` continua no mock como marcador do gateway real.
   */
  protected readonly checkoutLink = computed(() => ['/checkout', this.course()?.slug ?? '']);

  /** Modulos do curso no formato do ui-accordion. */
  protected readonly curriculumItems = computed<AccordionItem[]>(() =>
    (this.course()?.modules ?? []).map(module => ({
      title: module.title,
      subtitle: module.summary,
      content: '',
      bullets: module.topics,
      marker: String(module.number).padStart(2, '0'),
    }))
  );

  /** Perguntas do produto no formato do ui-accordion. */
  protected readonly faqItems = computed<AccordionItem[]>(() =>
    (this.course()?.faq ?? []).map(item => ({
      title: item.question,
      content: item.answer,
    }))
  );

  constructor() {
    // Title, description, Open Graph e canonical vem do `courseSeoResolver`
    // e sao aplicados pelo `App` num ponto so (Spec 009, decisao 8). O que
    // sobra para o componente e o que depende do conteudo da propria pagina:
    // os dados estruturados abaixo.
    effect(() => {
      const course = this.course();

      if (!course) {
        return;
      }

      this.jsonLd.set([
        {
          '@context': 'https://schema.org',
          '@type': 'Course',
          name: course.name,
          description: course.metaDescription,
          url: `${SITE_ORIGIN}/cursos/${course.slug}`,
          provider: {
            '@type': 'Organization',
            name: 'Delcastanher',
            url: SITE_ORIGIN,
          },
          // `offers` fica de fora enquanto o preco for o placeholder da Spec
          // 006: um schema com preco inventado gera rich result mentindo o
          // valor na propria SERP.
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          // Mesma fonte que alimenta o ui-accordion na tela: o que o buscador
          // le e exatamente o que o visitante ve, que e o que o Google exige.
          mainEntity: course.faq.map(item => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer },
          })),
        },
      ]);
    });

    // `view_course` so faz sentido para curso que existe: slug fora do
    // catalogo cai no desvio de funil, e contar isso como visualizacao de
    // produto inflaria o topo do funil com quem nunca viu a oferta.
    effect(() => {
      const course = this.course();

      if (!course) {
        return;
      }

      this.analytics.track('view_course', {
        course_slug: course.slug,
        course_title: course.name,
      });
    });
  }
}
