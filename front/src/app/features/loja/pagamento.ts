import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { PaymentTrust } from '../../shared/ui/payment-trust/payment-trust';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { tierLabel } from '../../core/mocks/plans.mock';
import { InstallmentOption, MercadoPagoLoader } from '../../core/services/mercado-pago.service';
import { PaymentMethodKind, StoreService, formatPrice } from '../../core/services/store.service';
import { UserService } from '../../core/services/user.service';

/**
 * Etapa de pagamento (Spec 014).
 *
 * Duas coisas acontecem aqui e em nenhum outro lugar: os dados do comprador sao
 * coletados (CPF inclusive, decisao 15) e o cartao e tokenizado dentro dos
 * Secure Fields do Mercado Pago (decisao 8). **Nenhum campo de cartao existe
 * como valor neste componente** — o formulario reativo abaixo nao tem numero,
 * validade nem CVV, e isso e proposital.
 */
@Component({
  selector: 'app-pagamento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PageContainer, Card, Button, PaymentTrust],
  template: `
    <ui-page-container>
      <h1 class="text-3xl font-semibold text-brand-navy">Pagamento</h1>

      @if (sandbox()) {
        <p
          class="mt-4 rounded-xl bg-state-warning/10 text-state-warning px-4 py-3 text-sm"
          role="status">
          <strong>Ambiente de teste:</strong> nenhuma cobrança real é feita neste momento. Use os
          cartões e usuários de teste do Mercado Pago.
        </p>
      }

      @if (!hasSelection()) {
        <ui-card variant="outline" padding="md" class="mt-6">
          <p class="text-slate-700">Nada selecionado para comprar.</p>
          <div class="mt-4">
            <ui-button variant="primary" size="sm" (click)="backToStore()">Voltar à loja</ui-button>
          </div>
        </ui-card>
      } @else {
        <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_340px] items-start">
          <div class="space-y-6">
            <ui-card padding="md">
              <h2 class="text-lg font-semibold text-brand-navy">Seus dados</h2>

              <form [formGroup]="form" class="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label for="firstName" class="block text-sm text-slate-700">Nome</label>
                  <input id="firstName" formControlName="firstName" class="input" />
                  @if (invalid('firstName')) {
                    <p class="mt-1 text-xs text-state-danger">Informe seu nome.</p>
                  }
                </div>

                <div>
                  <label for="lastName" class="block text-sm text-slate-700">Sobrenome</label>
                  <input id="lastName" formControlName="lastName" class="input" />
                  @if (invalid('lastName')) {
                    <p class="mt-1 text-xs text-state-danger">Informe seu sobrenome.</p>
                  }
                </div>

                <div class="sm:col-span-2">
                  <label for="email" class="block text-sm text-slate-700">E-mail</label>
                  <input id="email" type="email" formControlName="email" class="input" />
                  @if (invalid('email')) {
                    <p class="mt-1 text-xs text-state-danger">Informe um e-mail válido.</p>
                  }
                </div>

                <div class="sm:col-span-2">
                  <label for="document" class="block text-sm text-slate-700">CPF</label>
                  <input
                    id="document"
                    formControlName="document"
                    inputmode="numeric"
                    maxlength="14"
                    aria-describedby="cpf-motivo"
                    class="input" />
                  <!-- Dado novo na plataforma: dizer por que ele é pedido é
                       parte do que a Spec 009 exige. -->
                  <p id="cpf-motivo" class="mt-1 text-xs text-slate-500">
                    Obrigatório para emitir o PIX e para a análise antifraude do cartão.
                  </p>
                  @if (invalid('document')) {
                    <p class="mt-1 text-xs text-state-danger">Informe um CPF válido (11 dígitos).</p>
                  }
                </div>
              </form>
            </ui-card>

            <ui-card padding="md">
              <h2 class="text-lg font-semibold text-brand-navy">Forma de pagamento</h2>

              <div class="mt-4 flex gap-3" role="radiogroup" aria-label="Forma de pagamento">
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="method() === 'PIX'"
                  (click)="setMethod('PIX')"
                  [class]="tab(method() === 'PIX')">
                  PIX
                </button>
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="method() === 'CREDIT_CARD'"
                  (click)="setMethod('CREDIT_CARD')"
                  [class]="tab(method() === 'CREDIT_CARD')">
                  Cartão de crédito
                </button>
              </div>

              @if (method() === 'PIX') {
                <p class="mt-4 text-sm text-slate-600">
                  Geramos um QR Code com validade de 30 minutos. O acesso é liberado assim que o
                  pagamento for confirmado.
                </p>
              } @else {
                <!-- Secure Fields: os iframes do Mercado Pago são montados nestes
                     contêineres. Os dados do cartão não passam por este app. -->
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <div class="sm:col-span-2">
                    <span class="block text-sm text-slate-700">Número do cartão</span>
                    <div id="cardNumber" class="input h-11"></div>
                  </div>
                  <div>
                    <span class="block text-sm text-slate-700">Validade</span>
                    <div id="expirationDate" class="input h-11"></div>
                  </div>
                  <div>
                    <span class="block text-sm text-slate-700">Código de segurança</span>
                    <div id="securityCode" class="input h-11"></div>
                  </div>
                  <div class="sm:col-span-2">
                    <label for="cardholderName" class="block text-sm text-slate-700">
                      Nome impresso no cartão
                    </label>
                    <input id="cardholderName" [formControl]="cardholderName" class="input" />
                  </div>

                  @if (installments().length > 0) {
                    <div class="sm:col-span-2">
                      <label for="installments" class="block text-sm text-slate-700">Parcelas</label>
                      <select id="installments" [formControl]="installmentsControl" class="input">
                        @for (option of installments(); track option.installments) {
                          <option [value]="option.installments">{{ option.recommendedMessage }}</option>
                        }
                      </select>
                      <!-- Decisão 9: os juros são do comprador, e isso é dito
                           aqui, não em um rodapé. -->
                      <p class="mt-1 text-xs text-slate-500">
                        Parcelamento em até {{ maxInstallments() }}x. Os juros do parcelamento são
                        cobrados do comprador e já estão nos valores acima, informados pelo Mercado
                        Pago.
                      </p>
                    </div>
                  }
                </div>

                <p class="mt-3 text-xs text-slate-500">
                  Os dados do cartão são digitados dentro de campos seguros do Mercado Pago e não
                  passam pelos nossos servidores.
                </p>
              }

              @if (error(); as message) {
                <p class="mt-4 text-sm text-state-danger" role="alert">{{ message }}</p>
              }

              <!-- Spec 019, decisão 12: o lote virou entre a loja e aqui. O
                   valor novo é dito antes de cobrar, e o próximo clique confirma. -->
              @if (priceChange(); as change) {
                <div class="mt-4 rounded-xl bg-state-warning/10 px-4 py-3 text-sm text-slate-800" role="alert">
                  As vagas do lote anterior acabaram enquanto você escolhia. O pacote agora sai por
                  <strong>{{ change.to }}</strong> no {{ change.tierName }} (antes, {{ change.from }}).
                  Confira o valor e clique de novo para continuar.
                </div>
              }

              <div class="mt-6">
                <ui-button
                  variant="primary"
                  [fullWidth]="true"
                  [loading]="submitting()"
                  [disabled]="form.invalid"
                  (click)="pay()">
                  {{ method() === 'PIX' ? 'Gerar PIX de ' + total() : 'Pagar ' + total() }}
                </ui-button>
              </div>

              <ui-payment-trust class="mt-4" />
            </ui-card>
          </div>

          <ui-card variant="glass" padding="md" class="lg:sticky lg:top-24">
            <h2 class="text-lg font-semibold text-brand-navy">Resumo do pedido</h2>

            <ul class="mt-3 space-y-2">
              @if (bundle(); as pack) {
                <li class="flex justify-between gap-3 text-sm">
                  <span class="text-slate-700">
                    {{ pack.title }}
                    @if (pack.tier) {
                      <span class="block text-xs text-slate-500">{{ tierName(pack.tier) }} · 12 módulos</span>
                    }
                  </span>
                  <span class="text-slate-900 font-medium shrink-0">{{ total() }}</span>
                </li>
              } @else {
                @for (module of selected(); track module.id) {
                  <li class="flex justify-between gap-3 text-sm">
                    <span class="text-slate-700">Módulo {{ module.order }}: {{ module.title }}</span>
                    <span class="text-slate-900 font-medium shrink-0">
                      {{ price(module.priceCents) }}
                    </span>
                  </li>
                }
              }
            </ul>

            <div class="mt-4 pt-4 border-t border-brand-navy/10 flex justify-between items-baseline">
              <span class="text-slate-700">Total</span>
              <span class="text-2xl font-semibold text-brand-navy">{{ total() }}</span>
            </div>

            <p class="mt-3 text-xs text-slate-500">
              @if (bundle()) {
                Os 12 módulos liberam 6 meses de acesso a partir da confirmação do pagamento.
              } @else {
                Cada módulo libera 6 meses de acesso a partir da confirmação do pagamento.
              }
            </p>
          </ui-card>
        </div>
      }
    </ui-page-container>
  `,
  styles: [
    `
      .input {
        @apply mt-1 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-slate-900 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30;
      }
    `,
  ],
})
export class Pagamento implements OnInit {
  private readonly store = inject(StoreService);
  private readonly mp = inject(MercadoPagoLoader);
  private readonly users = inject(UserService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  private readonly methodState = signal<PaymentMethodKind>('PIX');
  private readonly installmentsState = signal<InstallmentOption[]>([]);
  private readonly errorState = signal<string | null>(null);
  private readonly submittingState = signal(false);
  private readonly fieldsMounted = signal(false);
  private readonly priceChangeState = signal<{ from: string; to: string; tierName: string } | null>(null);
  /** Ultimo BIN digitado: com o valor mudado, as parcelas precisam ser refeitas. */
  private lastBin = '';

  readonly selected = this.store.selectedModules;
  readonly bundle = this.store.selectedBundle;
  readonly hasSelection = this.store.hasSelection;
  readonly priceChange = this.priceChangeState.asReadonly();
  readonly method = this.methodState.asReadonly();
  readonly installments = this.installmentsState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly submitting = this.submittingState.asReadonly();
  readonly sandbox = computed(() => this.store.config()?.sandbox ?? false);
  readonly maxInstallments = computed(() => this.store.config()?.maxInstallments ?? 12);
  readonly total = computed(() => formatPrice(this.store.totalCents()));

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    document: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
  });

  readonly cardholderName = this.fb.nonNullable.control('');
  readonly installmentsControl = this.fb.nonNullable.control(1);

  ngOnInit(): void {
    // O perfil ja sabe nome e e-mail: pedir de novo o que a plataforma tem
    // seria atrito gratuito no unico passo que converte.
    this.users.ensureProfile().subscribe({
      next: profile => {
        const [first, ...rest] = (profile?.name ?? '').trim().split(/\s+/);

        this.form.patchValue({
          firstName: first ?? '',
          lastName: rest.join(' '),
          email: profile?.email ?? '',
        });
      },
      error: () => undefined,
    });

    this.store.loadPaymentConfig().subscribe({ error: () => undefined });

    if (!this.hasSelection()) {
      this.store.loadCatalog().subscribe({ error: () => undefined });
    }
  }

  tierName(tier: { order: number; name: string }): string {
    return tierLabel(tier);
  }

  invalid(field: string): boolean {
    const control = this.form.get(field);

    return !!control && control.invalid && control.touched;
  }

  tab(active: boolean): string {
    return [
      'flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition',
      active
        ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-deep'
        : 'border-brand-navy/15 text-slate-600 hover:border-brand-teal/50',
    ].join(' ');
  }

  price(cents: number | null): string {
    return formatPrice(cents);
  }

  setMethod(method: PaymentMethodKind): void {
    this.methodState.set(method);
    this.errorState.set(null);

    if (method === 'CREDIT_CARD') {
      void this.mountCardFields();
    }
  }

  backToStore(): void {
    this.router.navigate(['/loja']);
  }

  /** Cria o pedido. No cartao, tokeniza antes — o token e o que sobe. */
  async pay(): Promise<void> {
    this.form.markAllAsTouched();

    if (this.form.invalid || this.submittingState()) {
      return;
    }

    this.submittingState.set(true);
    this.errorState.set(null);

    try {
      if (this.bundle() && (await this.bundlePriceChanged())) {
        return;
      }

      const payload = {
        ...this.store.orderTarget(),
        method: this.methodState(),
        payer: this.form.getRawValue(),
        deviceId: this.mp.deviceId(),
        ...(this.methodState() === 'CREDIT_CARD' ? { card: await this.tokenize() } : {}),
      };

      const order = await new Promise<{ id: string }>((resolve, reject) => {
        this.store.createOrder(payload).subscribe({ next: resolve, error: reject });
      });

      this.store.clearSelection();
      this.router.navigate(['/loja/pedido', order.id]);
    } catch (error) {
      this.errorState.set(
        typeof error === 'string' ? error : 'Não foi possível concluir o pagamento. Tente de novo.',
      );
    } finally {
      this.submittingState.set(false);
    }
  }

  /**
   * Rele a oferta antes de cobrar o pacote (Spec 019, decisao 12). Se o lote
   * virou desde a loja, mostra o valor novo, refaz as parcelas do cartao e
   * **nao** cobra: o proximo clique e a confirmacao.
   *
   * Quem escolhe o lote cobrado continua sendo o servidor. Esta releitura so
   * evita que o aluno descubra o preco novo depois de pagar.
   */
  private async bundlePriceChanged(): Promise<boolean> {
    const before = this.store.totalCents();

    try {
      await new Promise<void>((resolve, reject) => {
        this.store.loadOffer().subscribe({ next: () => resolve(), error: reject });
      });
    } catch {
      // Sem a releitura, segue com o que a tela mostra: o servidor cobra o
      // lote vigente de qualquer jeito, e a tela do pedido mostra o valor.
      return false;
    }

    const after = this.store.totalCents();
    const tier = this.bundle()?.tier;

    if (after === before || !tier) {
      this.priceChangeState.set(null);

      return false;
    }

    this.priceChangeState.set({
      from: formatPrice(before),
      to: formatPrice(after),
      tierName: tierLabel(tier),
    });

    if (this.methodState() === 'CREDIT_CARD' && this.lastBin) {
      this.installmentsState.set(
        await this.mp.installments(after, this.lastBin, this.maxInstallments()),
      );
    }

    return true;
  }

  /**
   * Tokeniza o cartao dentro do SDK.
   *
   * O token e a **unica** coisa do cartao que sai do navegador: numero,
   * validade e CVV ficam nos iframes do Mercado Pago (decisao 8).
   */
  private async tokenize(): Promise<{
    token: string;
    paymentMethodId: string;
    installments: number;
  }> {
    const sdk = await this.mp.load();

    const token = await sdk.fields.createCardToken({
      cardholderName: this.cardholderName.value,
      identificationType: 'CPF',
      identificationNumber: this.form.getRawValue().document,
    });

    return {
      token: token.id,
      paymentMethodId: this.paymentMethodId,
      installments: Number(this.installmentsControl.value) || 1,
    };
  }

  private paymentMethodId = '';

  /** Monta os Secure Fields e, a cada BIN, pede as parcelas ao gateway. */
  private async mountCardFields(): Promise<void> {
    if (this.fieldsMounted()) {
      return;
    }

    try {
      const sdk = await this.mp.load();

      sdk.fields
        .create('cardNumber', {
          placeholder: '0000 0000 0000 0000',
          // O BIN e o que permite descobrir bandeira e parcelas antes do
          // cartao inteiro ser digitado.
          onBinChange: async (data: { bin?: string }) => {
            if (!data?.bin || data.bin.length < 6) {
              this.installmentsState.set([]);
              this.lastBin = '';

              return;
            }

            this.lastBin = data.bin;

            const [methods, options] = await Promise.all([
              sdk.getPaymentMethods({ bin: data.bin }),
              this.mp.installments(this.store.totalCents(), data.bin, this.maxInstallments()),
            ]);

            this.paymentMethodId = methods.results?.[0]?.id ?? '';
            this.installmentsState.set(options);
          },
        })
        .mount('cardNumber');

      sdk.fields.create('expirationDate', { placeholder: 'MM/AA' }).mount('expirationDate');
      sdk.fields.create('securityCode', { placeholder: 'CVV' }).mount('securityCode');

      this.fieldsMounted.set(true);
    } catch {
      this.errorState.set(
        'Não foi possível carregar o formulário de cartão. Tente o PIX ou recarregue a página.',
      );
    }
  }
}
