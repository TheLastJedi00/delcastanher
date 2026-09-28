import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { OrderView, StoreService, formatPrice, isTerminal } from '../../core/services/store.service';

/** Intervalo entre consultas do PIX. */
const POLL_MS = 5000;

/**
 * Acompanhamento do pedido (Spec 014).
 *
 * E aqui que o PIX vira acesso: enquanto o pedido estiver pendente e a aba
 * visivel, a tela consulta `GET /orders/:id`, que reconsulta o gateway no
 * servidor (decisao 14). Em `localhost` nenhum webhook chega, e em producao um
 * webhook perdido deixaria o aluno olhando um QR pago sem resposta — o polling
 * cobre os dois casos.
 */
@Component({
  selector: 'app-pedido',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageContainer, Card, Button],
  template: `
    <ui-page-container>
      @if (loading() && !order()) {
        <p class="text-slate-500" role="status">Carregando seu pedido…</p>
      }

      @if (order(); as pedido) {
        @switch (pedido.status) {
          @case ('PAID') {
            <ui-card padding="lg">
              <h1 class="text-3xl font-semibold text-state-success">Pagamento aprovado</h1>
              <p class="mt-3 text-slate-700">
                Tudo certo! Os módulos abaixo já estão liberados na sua área do aluno.
              </p>

              <ul class="mt-5 space-y-2">
                <!-- Spec 019: o pacote é um item para o aluno, e não doze. -->
                @if (pedido.bundle; as pack) {
                  <li class="flex justify-between gap-3 text-sm">
                    <span class="text-slate-700">{{ pack.title }} · {{ pack.tierName }}</span>
                    <span class="text-slate-500">12 módulos, acesso por 6 meses</span>
                  </li>
                } @else {
                  @for (item of pedido.items; track item.moduleId) {
                    <li class="flex justify-between gap-3 text-sm">
                      <span class="text-slate-700">{{ item.title }}</span>
                      <span class="text-slate-500">acesso por 6 meses</span>
                    </li>
                  }
                }
              </ul>

              <div class="mt-6 flex flex-wrap gap-3">
                <a routerLink="/ava">
                  <ui-button variant="primary">Ir para a área do aluno</ui-button>
                </a>
                <a routerLink="/loja">
                  <ui-button variant="outline">Ver outros módulos</ui-button>
                </a>
              </div>
            </ui-card>
          }

          @case ('PENDING') {
            <ui-card padding="lg">
              <h1 class="text-2xl font-semibold text-brand-navy">Pague com PIX para liberar</h1>

              @if (pedido.pix; as pix) {
                <div class="mt-6 grid gap-6 md:grid-cols-[220px_1fr] items-start">
                  <img
                    [src]="'data:image/png;base64,' + pix.qrCodeBase64"
                    alt="QR Code do PIX para pagamento"
                    class="w-full max-w-[220px] rounded-xl border border-brand-navy/10" />

                  <div>
                    <label for="copia-e-cola" class="block text-sm text-slate-700">
                      PIX Copia e Cola
                    </label>
                    <textarea
                      id="copia-e-cola"
                      readonly
                      rows="4"
                      class="mt-1 w-full rounded-xl border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-slate-700">{{ pix.qrCode }}</textarea>

                    <div class="mt-3 flex items-center gap-3">
                      <ui-button variant="outline" size="sm" (click)="copy(pix.qrCode)">
                        Copiar código
                      </ui-button>
                      <span class="text-sm text-state-success" aria-live="polite">
                        {{ copied() ? 'Código copiado!' : '' }}
                      </span>
                    </div>

                    <p class="mt-4 text-sm text-slate-600" aria-live="polite">
                      @if (remaining(); as restante) {
                        Este código expira em <strong>{{ restante }}</strong>.
                      }
                    </p>

                    <p class="mt-2 text-sm text-slate-500" role="status">
                      Estamos conferindo o pagamento automaticamente. Pode deixar esta página
                      aberta.
                    </p>
                  </div>
                </div>
              } @else {
                <p class="mt-3 text-slate-700" role="status">
                  Estamos processando seu pagamento. Isso costuma levar alguns segundos.
                </p>
              }
            </ui-card>
          }

          @case ('EXPIRED') {
            <ui-card padding="lg">
              <h1 class="text-2xl font-semibold text-brand-navy">O código PIX expirou</h1>
              <p class="mt-3 text-slate-700">
                Nenhuma cobrança foi feita. Você pode gerar um novo pedido com os mesmos módulos.
              </p>
              <div class="mt-6">
                <ui-button variant="primary" (click)="retry(pedido)">Tentar de novo</ui-button>
              </div>
            </ui-card>
          }

          @case ('REJECTED') {
            <ui-card padding="lg">
              <h1 class="text-2xl font-semibold text-state-danger">Pagamento não aprovado</h1>
              <!-- A mensagem vem do status_detail do gateway: "cartão
                   recusado pelo emissor" e "dados preenchidos errado" pedem
                   ações diferentes do comprador. -->
              <p class="mt-3 text-slate-700">{{ pedido.message }}</p>
              <p class="mt-2 text-sm text-slate-500">Nenhum valor foi cobrado.</p>
              <div class="mt-6 flex flex-wrap gap-3">
                <ui-button variant="primary" (click)="retry(pedido)">
                  Tentar outro meio de pagamento
                </ui-button>
                <a routerLink="/loja"><ui-button variant="outline">Voltar à loja</ui-button></a>
              </div>
            </ui-card>
          }

          @default {
            <ui-card padding="lg">
              <h1 class="text-2xl font-semibold text-brand-navy">Pedido encerrado</h1>
              <p class="mt-3 text-slate-700">
                Este pedido foi cancelado ou estornado e não está mais ativo.
              </p>
              <div class="mt-6">
                <a routerLink="/loja"><ui-button variant="primary">Voltar à loja</ui-button></a>
              </div>
            </ui-card>
          }
        }

        <p class="mt-6 text-xs text-slate-400">
          Pedido {{ pedido.id }} · {{ price(pedido.amountCents) }}
          @if (pedido.mpPaymentId) {
            · Mercado Pago {{ pedido.mpPaymentId }}
          }
        </p>
      }

      @if (error(); as message) {
        <p class="mt-6 text-sm text-state-danger" role="alert">{{ message }}</p>
      }
    </ui-page-container>
  `,
})
export class Pedido implements OnInit, OnDestroy {
  private readonly store = inject(StoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly orderState = signal<OrderView | null>(null);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);
  private readonly copiedState = signal(false);
  private readonly nowState = signal(Date.now());

  private timer: ReturnType<typeof setInterval> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;

  readonly order = this.orderState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly copied = this.copiedState.asReadonly();

  /** Contagem regressiva do PIX, em mm:ss. Vazia fora do estado pendente. */
  readonly remaining = computed(() => {
    const order = this.orderState();

    if (!order?.expiresAt || order.status !== 'PENDING') {
      return '';
    }

    const seconds = Math.max(0, Math.floor((Date.parse(order.expiresAt) - this.nowState()) / 1000));
    const minutes = Math.floor(seconds / 60);

    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  });

  ngOnInit(): void {
    const orderId = this.route.snapshot.paramMap.get('orderId');

    if (!orderId) {
      this.router.navigate(['/loja']);

      return;
    }

    this.fetch(orderId);

    // Duas cadencias diferentes de proposito: o relogio da contagem regressiva
    // corre de segundo em segundo (e so mexe em memoria), e a consulta ao
    // servidor vai de cinco em cinco.
    this.clock = setInterval(() => this.nowState.set(Date.now()), 1000);
    this.timer = setInterval(() => {
      const order = this.orderState();

      // Aba em segundo plano nao consulta: ninguem esta olhando, e a proxima
      // visita ja traz o estado atual.
      if (document.visibilityState !== 'visible' || !order || isTerminal(order.status)) {
        return;
      }

      this.fetch(order.id);
    }, POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    if (this.clock) {
      clearInterval(this.clock);
    }
  }

  price(cents: number): string {
    return formatPrice(cents);
  }

  copy(code: string): void {
    void navigator.clipboard?.writeText(code).then(() => {
      this.copiedState.set(true);
      setTimeout(() => this.copiedState.set(false), 3000);
    });
  }

  /**
   * Recompoe a selecao do pedido e volta ao pagamento. No pacote, a escolha e
   * o pacote ativo — e o lote e o que valer agora, nao o do pedido recusado.
   */
  retry(order: OrderView): void {
    this.store.clearSelection();

    if (order.bundle) {
      this.store.loadOffer().subscribe({
        next: offer => {
          if (offer.bundle) {
            this.store.selectBundle(offer.bundle.slug);
          }

          this.router.navigate(['/loja/pagamento']);
        },
        error: () => this.router.navigate(['/loja']),
      });

      return;
    }

    order.items.forEach(item => this.store.select(item.moduleId));
    this.router.navigate(['/loja/pagamento']);
  }

  private fetch(orderId: string): void {
    this.store.loadOrder(orderId).subscribe({
      next: order => {
        this.orderState.set(order);
        this.loadingState.set(false);
        this.errorState.set(null);

        // Comprou: o catalogo e o AVA precisam saber, senao a trilha continuaria
        // exibindo cadeado no modulo recem-liberado.
        if (order.status === 'PAID') {
          this.store.loadCatalog().subscribe({ error: () => undefined });
        }
      },
      error: (message: string) => {
        this.loadingState.set(false);
        // O pedido anterior continua na tela: trocar o estado por uma tela de
        // erro faria uma falha de rede parecer um pagamento perdido.
        this.errorState.set(message);
      },
    });
  }
}
