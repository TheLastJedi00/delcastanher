import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { findCourseBySlug } from '../../core/mocks/courses.mock';
import { isPlaceholder } from '../../core/mocks/placeholders';
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
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

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
    // Titulo e descricao por curso: as campanhas de Ads apontam direto para
    // cada slug, entao o snippet precisa mudar junto com o produto.
    effect(() => {
      const course = this.course();

      this.title.setTitle(
        course?.metaTitle ?? 'Curso não encontrado | Delcastanher'
      );
      this.meta.updateTag({
        name: 'description',
        content:
          course?.metaDescription ??
          'Este curso não está disponível. Veja os planos e cursos abertos da Delcastanher.',
      });
    });
  }
}
