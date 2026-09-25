import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ENTERPRISE_PLAN, LAUNCH_BUNDLE_COPY, tierLabel } from '../../core/mocks/plans.mock';
import { AuthService } from '../../core/services/auth.service';
import { StoreService, formatPrice } from '../../core/services/store.service';
import { AnimateOnScroll } from '../../shared/directives/animate-on-scroll';
import { BundlePrice } from '../../shared/ui/bundle-price/bundle-price';
import { Button } from '../../shared/ui/button/button';
import { Footer } from '../../shared/ui/footer/footer';
import { NavHeader, NavLink } from '../../shared/ui/nav-header/nav-header';
import { ScarcityBanner } from '../../shared/ui/scarcity-banner/scarcity-banner';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

/** Estado da leitura da oferta: o preco so existe no navegador (decisao 10). */
type OfferState = 'loading' | 'ready' | 'error';

/**
 * Planos e precos (Spec 019, decisao 11): o Pacote de Lancamento em destaque,
 * os modulos avulsos e a venda para empresas.
 *
 * A pagina e prerenderizada, mas o preco **nao** entra no HTML do build: o
 * lote vira com a venda, e um preco gravado no deploy mostraria "Lote
 * Fundador" depois de o Fundador esgotar. A oferta e lida no navegador, depois
 * da primeira renderizacao, e ate la a area de preco e um esqueleto do mesmo
 * tamanho (decisao 10).
 */
@Component({
  selector: 'app-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NavHeader,
    Footer,
    Button,
    SectionHeader,
    AnimateOnScroll,
    BundlePrice,
    ScarcityBanner,
  ],
  templateUrl: './plans.html',
})
export class Plans {
  /** Rotulo do botao do cabecalho conforme a sessao (Spec 019, decisao 16). */
  protected readonly authenticated = inject(AuthService).isAuthenticated;

  private readonly store = inject(StoreService);

  protected readonly copy = LAUNCH_BUNDLE_COPY;
  protected readonly enterprise = ENTERPRISE_PLAN;

  protected readonly navLinks: NavLink[] = [
    { label: 'Pacote', href: '#pacote' },
    { label: 'Módulos', href: '#modulos' },
    { label: 'Empresas', href: '#empresas' },
    { label: 'Início', href: '/', routerLink: '/' },
  ];

  protected readonly offerState = signal<OfferState>('loading');

  /** Linhas do esqueleto da lista de modulos: as 12 da grade. */
  protected readonly skeletonRows = Array.from({ length: 12 }, (_, index) => index);

  protected readonly bundle = computed(() => this.store.offer()?.bundle ?? null);
  protected readonly modules = computed(() => this.store.offer()?.modules ?? []);
  protected readonly tier = computed(() => this.bundle()?.tier ?? null);

  /**
   * Escassez com numero verdadeiro (decisao 11): so em lote com vagas. No
   * Preco oficial, sem limite, nao ha o que anunciar e a faixa some.
   */
  protected readonly scarcity = computed(() => {
    const tier = this.tier();

    if (!tier || tier.remaining === null) {
      return null;
    }

    const next = this.bundle()?.nextTier;

    return {
      headline: `Restam ${tier.remaining} ${tier.remaining === 1 ? 'vaga' : 'vagas'} no ${tierLabel(tier)}`,
      next: next ? `${formatPrice(next.priceCents)} no ${next.name}` : '',
    };
  });

  constructor() {
    // So no navegador: no prerender nao ha chamada, e o HTML sai com o
    // esqueleto. `afterNextRender` nao roda no servidor.
    afterNextRender(() => {
      this.store.loadOffer().subscribe({
        next: () => this.offerState.set('ready'),
        error: () => this.offerState.set('error'),
      });
    });
  }

  protected price(cents: number | null): string {
    return formatPrice(cents);
  }
}
