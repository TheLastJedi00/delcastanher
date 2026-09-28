import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LAUNCH_BUNDLE_COPY, tierLabel } from '../../core/mocks/plans.mock';
import { Badge } from '../../shared/ui/badge/badge';
import { BundlePrice } from '../../shared/ui/bundle-price/bundle-price';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { StoreService, formatPrice } from '../../core/services/store.service';
import { UserService } from '../../core/services/user.service';

/**
 * Loja de modulos (Spec 014).
 *
 * E o destino de quem concluiu o onboarding e ainda nao comprou nada (decisao
 * 19), e tambem de quem quer comprar mais um modulo. A selecao e multipla
 * porque a compra pode ser de um ou de varios de uma vez.
 *
 * Desde a Spec 019 o Pacote de Lancamento vem primeiro, e a escolha e
 * exclusiva: o pacote **ou** modulos avulsos, porque o pedido e um ou outro
 * (decisao 12).
 */
@Component({
  selector: 'app-loja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageContainer, Card, Button, Badge, BundlePrice],
  template: `
    <ui-page-container>
      <header class="mb-8">
        <h1 class="text-3xl md:text-4xl font-semibold text-brand-navy">Escolha seus módulos</h1>
        <p class="mt-2 text-slate-600 max-w-2xl">
          Cada módulo comprado libera o acesso por <strong>6 meses</strong> a partir da confirmação
          do pagamento. Leve o pacote com os 12 módulos, ou só os temas de que você precisa agora.
        </p>
      </header>

      @if (loading() && catalog().length === 0) {
        <p class="text-slate-500" role="status">Carregando os módulos…</p>
      }

      @if (error(); as message) {
        <ui-card variant="outline" padding="md" class="mb-6">
          <p class="text-state-danger" role="alert">{{ message }}</p>
          <div class="mt-4">
            <ui-button variant="outline" size="sm" (click)="reload()">Tentar de novo</ui-button>
          </div>
        </ui-card>
      }

      <div class="grid gap-8 lg:grid-cols-[1fr_340px] items-start">
        <div class="space-y-8">
          <!-- Pacote de Lançamento (Spec 019): primeiro, e exclusivo com os avulsos. -->
          @if (bundle(); as pack) {
            <section aria-labelledby="pacote-titulo">
              <ui-card [variant]="bundleSelected() ? 'elevated' : 'default'" padding="md">
                <div class="flex items-start gap-4">
                  <input
                    type="checkbox"
                    id="pacote"
                    class="mt-1 h-5 w-5 rounded border-brand-navy/30 text-brand-teal focus:ring-brand-teal"
                    [checked]="bundleSelected()"
                    [disabled]="!pack.tier"
                    (change)="toggleBundle(pack.slug)" />

                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold uppercase tracking-[0.12em] text-brand-teal-deep">
                      {{ copy.overline }}
                    </p>
                    <h2 id="pacote-titulo" class="mt-1 text-xl font-semibold text-brand-navy">
                      <label for="pacote" class="cursor-pointer">
                        {{ copy.headline }} — {{ copy.subheadline }}
                      </label>
                    </h2>
                    <p class="mt-1 text-sm text-slate-600">{{ copy.support }}</p>

                    <div class="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div>
                        <ui-bundle-price
                          [tier]="pack.tier"
                          [anchorCents]="pack.modulesTotalCents"
                          [maxInstallments]="maxInstallments()" />

                        @if (pack.tier?.remaining !== null && pack.tier?.remaining !== undefined) {
                          <p class="mt-2 text-sm font-semibold text-state-warning">
                            Restam {{ pack.tier!.remaining }}
                            {{ pack.tier!.remaining === 1 ? 'vaga' : 'vagas' }} neste lote
                            @if (pack.nextTier) {
                              — depois, {{ price(pack.nextTier.priceCents) }}
                            }
                          </p>
                        }
                      </div>

                      <ul class="space-y-1.5 text-sm text-slate-700">
                        @for (benefit of copy.benefits; track benefit) {
                          <li class="flex gap-2">
                            <span class="text-brand-teal-deep" aria-hidden="true">✓</span>
                            <span>{{ benefit }}</span>
                          </li>
                        }
                      </ul>
                    </div>

                    <!-- Decisão 8: sem abatimento. Quem já tem tudo não é
                         escondido do pacote, e sabe o que a compra faz. -->
                    @if (ownsEverything()) {
                      <p class="mt-4 text-sm text-slate-600">
                        Você já tem os 12 módulos. Comprar o pacote soma 6 meses ao acesso de cada um.
                      </p>
                    }
                  </div>
                </div>
              </ui-card>
            </section>
          }

          <!-- Seleção múltipla: fieldset porque as caixas pertencem a uma pergunta só. -->
          <fieldset class="space-y-4 border-0 p-0 m-0">
            <legend class="mb-4 text-lg font-semibold text-brand-navy">
              @if (bundle()) {
                Ou escolha módulos avulsos
              } @else {
                <span class="sr-only">Módulos disponíveis para compra</span>
              }
            </legend>

            @for (module of catalog(); track module.id) {
              <ui-card [variant]="isSelected(module.id) ? 'elevated' : 'default'" padding="md">
                <div class="flex items-start gap-4">
                  @if (module.purchasable) {
                    <input
                      type="checkbox"
                      class="mt-1 h-5 w-5 rounded border-brand-navy/30 text-brand-teal focus:ring-brand-teal"
                      [id]="'mod-' + module.id"
                      [checked]="isSelected(module.id)"
                      (change)="toggle(module.id)" />
                  }

                  <div class="flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <label
                        [for]="'mod-' + module.id"
                        class="text-lg font-semibold text-brand-navy cursor-pointer">
                        Módulo {{ module.order }}: {{ module.title }}
                      </label>

                      @if (module.access.unlocked) {
                        <ui-badge variant="success" [label]="'Liberado até ' + date(module.access.expiresAt)" />
                      } @else if (module.priceCents === null) {
                        <ui-badge variant="navy" label="Em breve" />
                      }
                    </div>

                    <p class="mt-1 text-slate-600">{{ module.summary }}</p>
                    <p class="mt-2 text-sm text-slate-500">
                      {{ module.lessonCount }} {{ module.lessonCount === 1 ? 'aula' : 'aulas' }}
                    </p>
                  </div>

                  <div class="text-right shrink-0">
                    <p class="text-xl font-semibold text-brand-navy">{{ price(module.priceCents) }}</p>
                    @if (module.priceCents !== null && !module.access.unlocked) {
                      <p class="text-xs text-slate-500">acesso por 6 meses</p>
                    }
                  </div>
                </div>
              </ui-card>
            }
          </fieldset>
        </div>

        <!-- Resumo do pedido. -->
        <ui-card variant="glass" padding="md" class="lg:sticky lg:top-24">
          <h2 class="text-lg font-semibold text-brand-navy">Resumo</h2>

          @if (selectedBundle(); as pack) {
            <ul class="mt-3 space-y-2">
              <li class="flex justify-between gap-3 text-sm">
                <span class="text-slate-700">
                  {{ pack.title }}
                  @if (pack.tier) {
                    <span class="block text-xs text-slate-500">{{ tierName(pack.tier) }} · 12 módulos</span>
                  }
                </span>
                <span class="text-slate-900 font-medium shrink-0">{{ price(totalCents()) }}</span>
              </li>
            </ul>

            <div class="mt-4 pt-4 border-t border-brand-navy/10 flex justify-between items-baseline">
              <span class="text-slate-700">Total</span>
              <span class="text-2xl font-semibold text-brand-navy">{{ price(totalCents()) }}</span>
            </div>
          } @else if (selected().length === 0) {
            <p class="mt-3 text-sm text-slate-600">
              Nada selecionado ainda. Marque o pacote ou ao menos um módulo para continuar.
            </p>
          } @else {
            <ul class="mt-3 space-y-2">
              @for (module of selected(); track module.id) {
                <li class="flex justify-between gap-3 text-sm">
                  <span class="text-slate-700">Módulo {{ module.order }}: {{ module.title }}</span>
                  <span class="text-slate-900 font-medium shrink-0">{{ price(module.priceCents) }}</span>
                </li>
              }
            </ul>

            <div class="mt-4 pt-4 border-t border-brand-navy/10 flex justify-between items-baseline">
              <span class="text-slate-700">Total</span>
              <span class="text-2xl font-semibold text-brand-navy">{{ price(totalCents()) }}</span>
            </div>

            <!-- Decisão 12: com três ou mais avulsos acima do lote, o pacote
                 sai mais barato — e o resumo diz isso antes do pagamento. -->
            @if (economy(); as deal) {
              <div class="mt-4 rounded-xl bg-brand-teal/10 px-4 py-3" role="status">
                <p class="text-sm text-brand-navy">
                  O pacote com os 12 módulos sai por <strong>{{ price(deal.priceCents) }}</strong>
                  no {{ deal.tierName }}.
                </p>
                <div class="mt-3">
                  <ui-button variant="outline" size="sm" (click)="toggleBundle(deal.slug)">
                    Trocar pelo pacote
                  </ui-button>
                </div>
              </div>
            }
          }

          <div class="mt-5">
            <ui-button
              variant="primary"
              [fullWidth]="true"
              [disabled]="!hasSelection()"
              (click)="goToPayment()">
              Ir para o pagamento
            </ui-button>

            @if (!hasSelection()) {
              <p class="mt-2 text-xs text-slate-500" aria-live="polite">
                Selecione o pacote ou ao menos um módulo para continuar.
              </p>
            }
          </div>

          <p class="mt-4 text-xs text-slate-500">
            Pagamento por PIX ou cartão de crédito, processado pelo Mercado Pago.
          </p>
        </ui-card>
      </div>
    </ui-page-container>
  `,
})
export class Loja implements OnInit {
  private readonly store = inject(StoreService);
  private readonly router = inject(Router);
  private readonly users = inject(UserService);
  private readonly route = inject(ActivatedRoute);

  protected readonly copy = LAUNCH_BUNDLE_COPY;

  readonly catalog = this.store.catalog;
  readonly loading = this.store.loading;
  readonly error = this.store.error;
  readonly totalCents = this.store.totalCents;
  readonly selected = this.store.selectedModules;
  readonly bundle = this.store.bundleOffer;
  readonly selectedBundle = this.store.selectedBundle;
  readonly hasSelection = this.store.hasSelection;
  readonly maxInstallments = computed(() => this.store.config()?.maxInstallments ?? 12);

  readonly bundleSelected = computed(() => this.selectedBundle() !== null);

  /** Todos os modulos do catalogo ja liberados: o pacote so estende. */
  readonly ownsEverything = computed(() => {
    const catalog = this.catalog();

    return catalog.length > 0 && catalog.every(module => module.access.unlocked);
  });

  /**
   * Oferta de troca pelo pacote (decisao 12): tres ou mais avulsos e a soma
   * acima do lote vigente. No Fundador isso acontece ja no terceiro modulo
   * (3 x R$ 197 = R$ 591, contra R$ 590).
   */
  readonly economy = computed(() => {
    const pack = this.bundle();
    const tier = pack?.tier;

    if (!pack || !tier || this.bundleSelected() || this.selected().length < 3) {
      return null;
    }

    return this.totalCents() > tier.priceCents
      ? { slug: pack.slug, priceCents: tier.priceCents, tierName: tierLabel(tier) }
      : null;
  });

  /** Recarrega mesmo com catalogo em memoria: a compra pode ter vindo de outra aba. */
  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const bundleSlug = params.get('pacote');
    const moduleOrder = Number(params.get('modulo'));

    this.store.loadCatalog().subscribe({
      next: catalog => {
        // `?modulo=<ordem>` (Spec 019, decisao 11): a ordem, e nao o id, deixa
        // o link do `/planos` legivel e igual em todos os ambientes.
        const module = catalog.find(item => item.order === moduleOrder && item.purchasable);

        if (!bundleSlug && module) {
          this.store.select(module.id);
        }
      },
      error: () => undefined,
    });
    // A oferta e publica e opcional aqui: sem ela, a loja segue vendendo os
    // avulsos, so sem o card do pacote.
    this.store.loadOffer().subscribe({
      next: offer => {
        if (bundleSlug && offer.bundle?.slug === bundleSlug) {
          this.store.selectBundle(bundleSlug);
        }
      },
      error: () => undefined,
    });
    this.users.ensureProfile().subscribe({ error: () => undefined });

    // O parametro sai da URL depois de lido: sem isso, o voltar do navegador
    // remarcaria o que o aluno ja desmarcou.
    if (params.has('pacote') || params.has('modulo')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { pacote: null, modulo: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  reload(): void {
    this.store.loadCatalog().subscribe({ error: () => undefined });
    this.store.loadOffer().subscribe({ error: () => undefined });
  }

  isSelected(moduleId: string): boolean {
    return this.store.isSelected(moduleId);
  }

  toggle(moduleId: string): void {
    this.store.toggle(moduleId);
  }

  toggleBundle(slug: string): void {
    this.store.toggleBundle(slug);
  }

  tierName(tier: { order: number; name: string }): string {
    return tierLabel(tier);
  }

  price(cents: number | null): string {
    return formatPrice(cents);
  }

  date(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
  }

  goToPayment(): void {
    this.router.navigate(['/loja/pagamento']);
  }
}

