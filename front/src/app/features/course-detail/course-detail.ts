import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map, of, switchMap } from 'rxjs';

import {
  CourseFacts,
  NO_COURSE_FACTS,
  findCourseBySlug,
  resolveCourseText,
} from '../../core/mocks/courses.mock';
import { isPlaceholder } from '../../core/mocks/placeholders';
import { LAUNCH_BUNDLE_COPY, bundleScarcity } from '../../core/mocks/plans.mock';
import { AnalyticsService } from '../../core/services/analytics.service';
import { buildThenBrowser } from '../../core/services/build-then-browser';
import { CourseSummaryService } from '../../core/services/course-summary.service';
import { JsonLdService } from '../../core/services/json-ld.service';
import { SITE_ORIGIN } from '../../core/services/seo.service';
import { StoreService, formatPrice } from '../../core/services/store.service';
import { AnimateOnScroll } from '../../shared/directives/animate-on-scroll';
import { Accordion, AccordionItem } from '../../shared/ui/accordion/accordion';
import { BundlePrice } from '../../shared/ui/bundle-price/bundle-price';
import { Button } from '../../shared/ui/button/button';
import { Footer } from '../../shared/ui/footer/footer';
import { GlassCard } from '../../shared/ui/glass-card/glass-card';
import { ScarcityBanner } from '../../shared/ui/scarcity-banner/scarcity-banner';
import { NavHeader, NavLink } from '../../shared/ui/nav-header/nav-header';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

/** Marcador de texto ainda nao definido, em qualquer ponto da frase: `[PRAZO]`. */
const PLACEHOLDER_MARKER = /\[[^\]]+\]/;

@Component({
  selector: 'app-course-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NavHeader,
    Accordion,
    BundlePrice,
    Footer,
    Button,
    GlassCard,
    ScarcityBanner,
    SectionHeader,
    AnimateOnScroll,
  ],
  templateUrl: './course-detail.html',
})
export class CourseDetail {
  /** Rotulo do botao do cabecalho conforme a sessao (Spec 019, decisao 16). */
  protected readonly authenticated = inject(AuthService).isAuthenticated;

  private readonly route = inject(ActivatedRoute);
  private readonly analytics = inject(AnalyticsService);
  private readonly jsonLd = inject(JsonLdService);
  private readonly summaries = inject(CourseSummaryService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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

  /**
   * Carga horaria e meses de acesso, da API (Spec 022, decisoes 13 e 14): no
   * build a pagina sai com o valor do momento, e o navegador atualiza. Sem
   * resposta, o que depende deles some da pagina.
   */
  protected readonly facts = toSignal(
    toObservable(this.slug).pipe(
      switchMap(slug =>
        slug && findCourseBySlug(slug)
          ? buildThenBrowser(fresh => this.summaries.summary(slug, fresh), this.isBrowser)
          : of({ ok: false as const }),
      ),
      map((result): CourseFacts =>
        result.ok
          ? { workloadHours: result.value.workloadHours, accessMonths: result.value.accessMonths }
          : NO_COURSE_FACTS,
      ),
    ),
    { initialValue: NO_COURSE_FACTS },
  );

  /** Cartoes da hero com o dado resolvido; os que dependem de dado ausente somem. */
  protected readonly formatCards = computed(() =>
    (this.course()?.format ?? [])
      .map(item => ({ label: item.label, value: resolveCourseText(item.value, this.facts()) }))
      .filter((item): item is { label: string; value: string } => item.value !== null),
  );

  /**
   * Perguntas com a resposta resolvida. Sai a que depende de dado ausente e a
   * que ainda carrega um placeholder, como o prazo de garantia: dado ausente
   * some da vitrine (Spec 022, decisao 13).
   */
  private readonly faq = computed(() =>
    (this.course()?.faq ?? [])
      .map(item => ({ question: item.question, answer: resolveCourseText(item.answer, this.facts()) }))
      .filter(
        (item): item is { question: string; answer: string } =>
          item.answer !== null && !PLACEHOLDER_MARKER.test(item.answer),
      ),
  );

  /**
   * Depoimentos que podem ir ao ar (Spec 022, decisao 15): entrada com nome ou
   * citacao ainda placeholder e descartada, para que um depoimento incompleto
   * nunca volte a pagina por engano. Vazio, a secao inteira some.
   */
  protected readonly testimonials = computed(() =>
    (this.course()?.testimonials ?? []).filter(
      item => !isPlaceholder(item.name) && !isPlaceholder(item.quote),
    ),
  );

  /**
   * Garantias com a descricao resolvida pelos dados reais (decisao 18). A que
   * ainda depende de um prazo placeholder sai: garantia sem prazo nao e
   * garantia que se possa prometer.
   */
  protected readonly guarantees = computed(() =>
    (this.course()?.guarantees ?? [])
      .filter(item => !isPlaceholder(item.highlight))
      .map(item => ({
        ...item,
        description: resolveCourseText(item.description, this.facts()) ?? '',
      })),
  );

  protected readonly isPlaceholder = isPlaceholder;

  // --- Investimento: a mesma oferta do /planos (Spec 019, decisao 10) ---

  private readonly store = inject(StoreService);

  /** O preco so existe no navegador: no build a secao sai com o esqueleto. */
  protected readonly offerState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly bundle = computed(() => this.store.offer()?.bundle ?? null);
  protected readonly tier = computed(() => this.bundle()?.tier ?? null);

  /** Faixa de escassez com as vagas reais do lote vigente, como no /planos. */
  protected readonly scarcity = computed(() => bundleScarcity(this.bundle()));

  /**
   * Menor preco entre os modulos avulsos a venda, lido da oferta: muda sozinho
   * quando o preco muda no painel. Nulo sem oferta ou sem modulo com preco.
   */
  protected readonly moduleFromCents = computed(() => {
    const prices = (this.store.offer()?.modules ?? [])
      .map(module => module.priceCents)
      .filter((cents): cents is number => cents !== null);

    return prices.length ? Math.min(...prices) : null;
  });

  protected price(cents: number): string {
    return formatPrice(cents);
  }

  /**
   * Destino dos CTAs de compra: a loja, com o Pacote de Lancamento escolhido
   * (Spec 019). Ela exige conta, entao o visitante passa por cadastro e
   * onboarding antes de pagar.
   */
  protected readonly checkoutLink = ['/loja'];
  protected readonly checkoutQuery = { pacote: LAUNCH_BUNDLE_COPY.slug };

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
    this.faq().map(item => ({
      title: item.question,
      content: item.answer,
    }))
  );

  constructor() {
    // So no navegador, como no /planos: o preco muda com a venda, e um preco
    // do build ficaria velho. `afterNextRender` nao roda no servidor.
    afterNextRender(() => {
      this.store.loadOffer().subscribe({
        next: () => this.offerState.set('ready'),
        error: () => this.offerState.set('error'),
      });
    });

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
          mainEntity: this.faq().map(item => ({
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
