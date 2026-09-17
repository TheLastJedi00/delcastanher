import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { StoreModuleItem, StoreService, formatPrice } from '../../core/services/store.service';
import { UserService } from '../../core/services/user.service';

/**
 * Loja de modulos (Spec 014).
 *
 * E o destino de quem concluiu o onboarding e ainda nao comprou nada (decisao
 * 19), e tambem de quem quer comprar mais um modulo. A selecao e multipla
 * porque a compra pode ser de um ou de varios de uma vez.
 */
@Component({
  selector: 'app-loja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageContainer, Card, Button, Badge],
  template: `
    <ui-page-container>
      <header class="mb-8">
        <h1 class="text-3xl md:text-4xl font-semibold text-brand-navy">Escolha seus módulos</h1>
        <p class="mt-2 text-slate-600 max-w-2xl">
          Cada módulo comprado libera o acesso por <strong>6 meses</strong> a partir da confirmação
          do pagamento. Você pode levar um ou vários de uma vez.
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
        <!-- Seleção múltipla: fieldset porque as caixas pertencem a uma pergunta só. -->
        <fieldset class="space-y-4 border-0 p-0 m-0">
          <legend class="sr-only">Módulos disponíveis para compra</legend>

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

        <!-- Resumo do pedido: some no mobile para o topo não ficar antes da lista. -->
        <ui-card variant="glass" padding="md" class="lg:sticky lg:top-24">
          <h2 class="text-lg font-semibold text-brand-navy">Resumo</h2>

          @if (selected().length === 0) {
            <p class="mt-3 text-sm text-slate-600">
              Nenhum módulo selecionado ainda. Marque ao menos um para continuar.
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
          }

          <div class="mt-5">
            <ui-button
              variant="primary"
              [fullWidth]="true"
              [disabled]="selected().length === 0"
              (click)="goToPayment()">
              Ir para o pagamento
            </ui-button>

            @if (selected().length === 0) {
              <p class="mt-2 text-xs text-slate-500" aria-live="polite">
                Selecione ao menos um módulo para continuar.
              </p>
            }
          </div>

          <p class="mt-4 text-xs text-slate-500">
            Pagamento por PIX ou cartão de crédito, processado pelo Mercado Pago.
          </p>

          <p class="mt-4 text-xs text-slate-500">
            Precisa só ajustar seus dados?
            <a routerLink="/ava/perfil" class="text-brand-teal-deep underline">Abrir meu perfil</a>.
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

  readonly catalog = this.store.catalog;
  readonly loading = this.store.loading;
  readonly error = this.store.error;
  readonly totalCents = this.store.totalCents;
  readonly selected = this.store.selectedModules;

  /** Recarrega mesmo com catalogo em memoria: a compra pode ter vindo de outra aba. */
  ngOnInit(): void {
    this.store.loadCatalog().subscribe({ error: () => undefined });
    this.users.ensureProfile().subscribe({ error: () => undefined });
  }

  reload(): void {
    this.store.loadCatalog().subscribe({ error: () => undefined });
  }

  isSelected(moduleId: string): boolean {
    return this.store.isSelected(moduleId);
  }

  toggle(moduleId: string): void {
    this.store.toggle(moduleId);
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
