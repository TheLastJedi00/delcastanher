import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { EMPTY, distinctUntilChanged, map, switchMap, tap } from 'rxjs';
import { Router } from '@angular/router';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { PaymentTrust } from '../../shared/ui/payment-trust/payment-trust';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { tierLabel } from '../../core/mocks/plans.mock';
import { CepService } from '../../core/services/cep.service';
import {
  InstallmentOption,
  MercadoPagoLoader,
  MercadoPagoSdk,
  SecureField,
} from '../../core/services/mercado-pago.service';
import { PaymentMethodKind, StoreService, formatPrice } from '../../core/services/store.service';
import { UserService } from '../../core/services/user.service';

/** Os tres Secure Fields; o id do contêiner e o tipo do campo no SDK. */
type CardField = 'cardNumber' | 'expirationDate' | 'securityCode';

/** `srLabel` e o rotulo que o leitor de tela le dentro do iframe. */
const CARD_FIELDS: { type: CardField; placeholder: string; srLabel: string }[] = [
  { type: 'cardNumber', placeholder: '0000 0000 0000 0000', srLabel: 'Número do cartão' },
  { type: 'expirationDate', placeholder: 'MM/AA', srLabel: 'Validade do cartão' },
  { type: 'securityCode', placeholder: 'CVV', srLabel: 'Código de segurança' },
];

/**
 * Estilo dentro do iframe. 16px e o minimo para o iOS nao dar zoom ao tocar no
 * campo; o padding e o que o `.input` daria se o iframe nao ocupasse a caixa.
 */
const SECURE_FIELD_STYLE = {
  fontSize: '16px',
  color: '#0f172a',
  placeholderColor: '#94a3b8',
  padding: '0 12px',
};

/** So os digitos do CPF. */
function cpfDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** CPF com ou sem mascara, conferido pelos digitos verificadores. */
function cpfValidator(control: AbstractControl<string>): ValidationErrors | null {
  const raw = control.value ?? '';

  if (!raw) {
    return null;
  }

  const digits = cpfDigits(raw);

  if (!/^[\d.\-\s]+$/.test(raw) || digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
    return { cpf: true };
  }

  const check = (length: number) => {
    const sum = [...digits.slice(0, length)].reduce(
      (total, digit, index) => total + Number(digit) * (length + 1 - index),
      0,
    );

    return ((sum * 10) % 11) % 10;
  };

  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]) ? null : { cpf: true };
}

/**
 * Traduz a recusa do `createCardToken`. O SDK rejeita com a lista de causas do
 * Mercado Pago (`[{ code, message }]`), e o comprador precisa saber qual campo
 * corrigir, nao so que "nao foi possivel".
 */
function cardTokenMessage(error: unknown): string | null {
  const causes = Array.isArray(error)
    ? error
    : Array.isArray((error as { cause?: unknown })?.cause)
      ? (error as { cause: unknown[] }).cause
      : null;

  if (!causes) {
    return null;
  }

  const codes = causes.map(cause => String((cause as { code?: unknown })?.code ?? ''));
  const has = (...wanted: string[]) => codes.some(code => wanted.includes(code));

  if (has('205', 'E301')) {
    return 'Confira o número do cartão.';
  }

  if (has('208', '209', '325', '326', 'E203', 'E205')) {
    return 'Confira a validade do cartão.';
  }

  if (has('224', 'E302')) {
    return 'Confira o código de segurança do cartão.';
  }

  if (has('221', '316')) {
    return 'Informe o nome como está impresso no cartão.';
  }

  if (has('212', '213', '214', '322', '323', '324')) {
    return 'Confira o CPF: o Mercado Pago não o aceitou.';
  }

  return 'Confira os dados do cartão: número, validade, código de segurança e nome.';
}

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
                  <input id="firstName" formControlName="firstName" autocomplete="given-name" class="input" />
                  @if (invalid('firstName')) {
                    <p class="mt-1 text-xs text-state-danger">Informe seu nome.</p>
                  }
                </div>

                <div>
                  <label for="lastName" class="block text-sm text-slate-700">Sobrenome</label>
                  <input id="lastName" formControlName="lastName" autocomplete="family-name" class="input" />
                  @if (invalid('lastName')) {
                    <p class="mt-1 text-xs text-state-danger">Informe seu sobrenome.</p>
                  }
                </div>

                <div class="sm:col-span-2">
                  <label for="email" class="block text-sm text-slate-700">E-mail</label>
                  <input
                    id="email"
                    type="email"
                    formControlName="email"
                    autocomplete="email"
                    autocapitalize="off"
                    spellcheck="false"
                    class="input" />
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
                  <p id="cpf-motivo" class="mt-1.5 text-xs leading-relaxed text-slate-500">
                    Obrigatório para emitir o PIX e para a análise antifraude do cartão.
                  </p>
                  @if (invalid('document')) {
                    <p class="mt-1 text-xs text-state-danger">
                      Informe um CPF válido (11 dígitos, com ou sem pontos).
                    </p>
                  }
                </div>

                <!-- Spec 023, decisao A3: a NF-e exige o endereco do
                     destinatario. Dizer por que ele e pedido e parte do que a
                     Spec 009 exige, como no CPF. O grid fica num div interno:
                     o <legend> nao vira item de grid do fieldset, e o texto de
                     baixo, com margem negativa, subia por cima dele. -->
                <fieldset formGroupName="address" class="sm:col-span-2 mt-2">
                  <legend class="text-sm font-semibold text-brand-navy">Endereço</legend>
                  <p class="mt-1 text-xs leading-relaxed text-slate-500">
                    Obrigatório para emitir a nota fiscal da compra, enviada por e-mail.
                  </p>

                  <div class="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label for="zip" class="block text-sm text-slate-700">CEP</label>
                      <input
                        id="zip"
                        formControlName="zip"
                        inputmode="numeric"
                        maxlength="9"
                        autocomplete="postal-code"
                        class="input" />
                      @if (cepState() === 'loading') {
                        <p class="mt-1 text-xs text-slate-500">Buscando o endereço...</p>
                      } @else if (cepState() === 'notfound') {
                        <p class="mt-1 text-xs text-state-danger" data-testid="cep-erro">
                          CEP não encontrado. Confira os números.
                        </p>
                      } @else if (invalid('address.zip')) {
                        <p class="mt-1 text-xs text-state-danger">Informe um CEP válido (8 dígitos).</p>
                      }
                    </div>

                    <div>
                      <span class="block text-sm text-slate-700">Cidade / UF</span>
                      <p class="mt-1 py-2.5 text-slate-900" data-testid="cidade-uf">
                        {{ cityLabel() || '—' }}
                      </p>
                    </div>

                    <div class="sm:col-span-2">
                      <label for="street" class="block text-sm text-slate-700">Logradouro</label>
                      <input id="street" formControlName="street" autocomplete="address-line1" class="input" />
                      @if (invalid('address.street')) {
                        <p class="mt-1 text-xs text-state-danger">Informe o logradouro.</p>
                      }
                    </div>

                    <div>
                      <label for="number" class="block text-sm text-slate-700">Número</label>
                      <input id="number" formControlName="number" class="input" />
                      @if (invalid('address.number')) {
                        <p class="mt-1 text-xs text-state-danger">Informe o número (ou SN).</p>
                      }
                    </div>

                    <div>
                      <label for="complement" class="block text-sm text-slate-700">
                        Complemento <span class="text-slate-400">(opcional)</span>
                      </label>
                      <input id="complement" formControlName="complement" autocomplete="address-line2" class="input" />
                    </div>

                    <div class="sm:col-span-2">
                      <label for="district" class="block text-sm text-slate-700">Bairro</label>
                      <input id="district" formControlName="district" class="input" />
                      @if (invalid('address.district')) {
                        <p class="mt-1 text-xs text-state-danger">Informe o bairro.</p>
                      }
                    </div>
                  </div>
                </fieldset>
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
              }

              <!-- Secure Fields: os iframes do Mercado Pago são montados nestes
                   contêineres. Os dados do cartão não passam por este app.
                   O bloco entra no primeiro clique em "Cartão" e depois só é
                   escondido: removido do DOM, levava os iframes junto, e voltar
                   do PIX deixava os campos vazios e sem como digitar. -->
              @if (cardOpened()) {
                <div class="mt-4" [class.hidden]="method() !== 'CREDIT_CARD'">
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="sm:col-span-2">
                      <span class="block text-sm text-slate-700">Número do cartão</span>
                      <div id="cardNumber" class="input secure-field"></div>
                      @if (cardFieldError('cardNumber')) {
                        <p class="mt-1 text-xs text-state-danger" data-testid="erro-cardNumber">
                          Confira o número do cartão.
                        </p>
                      }
                    </div>
                    <div>
                      <span class="block text-sm text-slate-700">Validade</span>
                      <div id="expirationDate" class="input secure-field"></div>
                      @if (cardFieldError('expirationDate')) {
                        <p class="mt-1 text-xs text-state-danger" data-testid="erro-expirationDate">
                          Confira a validade (MM/AA).
                        </p>
                      }
                    </div>
                    <div>
                      <span class="block text-sm text-slate-700">Código de segurança</span>
                      <div id="securityCode" class="input secure-field"></div>
                      @if (cardFieldError('securityCode')) {
                        <p class="mt-1 text-xs text-state-danger" data-testid="erro-securityCode">
                          Confira o código de segurança.
                        </p>
                      }
                    </div>
                    <div class="sm:col-span-2">
                      <label for="cardholderName" class="block text-sm text-slate-700">
                        Nome impresso no cartão
                      </label>
                      <input
                        id="cardholderName"
                        [formControl]="cardholderName"
                        autocomplete="cc-name"
                        autocapitalize="characters"
                        spellcheck="false"
                        class="input" />
                      @if (cardholderName.invalid && cardholderName.touched) {
                        <p class="mt-1 text-xs text-state-danger">Informe o nome como está no cartão.</p>
                      }
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
                </div>
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

              <!-- Spec 020, decisão 7: sem conta recebedora a loja não cobra.
                   O botão sai; o servidor também recusa com 503. -->
              <div class="mt-6">
                @if (unavailable()) {
                  <p
                    class="rounded-xl bg-state-warning/10 px-4 py-3 text-sm text-slate-800"
                    role="status"
                    data-testid="pagamento-indisponivel">
                    <strong>Pagamentos temporariamente indisponíveis.</strong> Sua escolha continua
                    salva: tente de novo em alguns instantes ou fale com o suporte.
                  </p>
                } @else {
                  <ui-button
                    variant="primary"
                    [fullWidth]="true"
                    [loading]="submitting()"
                    [disabled]="form.invalid"
                    (click)="pay()">
                    {{ method() === 'PIX' ? 'Gerar PIX de ' + total() : 'Pagar ' + total() }}
                  </ui-button>
                }
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
        @apply mt-1.5 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-slate-900 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30;
      }

      /* O iframe do Mercado Pago ocupa 100% do contêiner. Com o padding do
         .input sobravam uns 22px de altura, e tocar na borda da caixa não
         abria o teclado. O espaçamento interno vai no style do campo. */
      .secure-field {
        @apply h-12 overflow-hidden p-0 focus-within:border-brand-teal focus-within:ring-2 focus-within:ring-brand-teal/30;
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
  private readonly cep = inject(CepService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly methodState = signal<PaymentMethodKind>('PIX');
  private readonly installmentsState = signal<InstallmentOption[]>([]);
  private readonly errorState = signal<string | null>(null);
  private readonly submittingState = signal(false);
  private readonly fieldsMounted = signal(false);
  private mounting = false;
  /** O bloco do cartao entra no DOM no primeiro clique e nao sai mais. */
  private readonly cardOpenedState = signal(false);
  /** Campo do cartao com valor invalido, informado pelo `validityChange`. */
  private readonly cardInvalidState = signal<Record<CardField, boolean>>({
    cardNumber: false,
    expirationDate: false,
    securityCode: false,
  });
  /** Campo que o comprador ja visitou: o erro so aparece depois do `blur`. */
  private readonly cardTouchedState = signal<Record<CardField, boolean>>({
    cardNumber: false,
    expirationDate: false,
    securityCode: false,
  });
  private readonly priceChangeState = signal<{ from: string; to: string; tierName: string } | null>(null);
  /** Ultimo BIN digitado: com o valor mudado, as parcelas precisam ser refeitas. */
  private lastBin = '';

  readonly selected = this.store.selectedModules;
  readonly bundle = this.store.selectedBundle;
  readonly hasSelection = this.store.hasSelection;
  readonly priceChange = this.priceChangeState.asReadonly();
  readonly method = this.methodState.asReadonly();
  readonly cardOpened = this.cardOpenedState.asReadonly();
  readonly installments = this.installmentsState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly submitting = this.submittingState.asReadonly();
  readonly sandbox = computed(() => this.store.config()?.sandbox ?? false);
  /** A API respondeu que a loja esta fechada (Spec 020, decisao 7). */
  readonly unavailable = computed(() => this.store.config()?.enabled === false);
  readonly maxInstallments = computed(() => this.store.config()?.maxInstallments ?? 12);
  readonly total = computed(() => formatPrice(this.store.totalCents()));

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    // Aceita o CPF como o celular preenche (com pontos e traco); a API recebe
    // so os digitos.
    document: ['', [Validators.required, cpfValidator]],
    // Cidade, UF e codigo IBGE nao sao digitados: vem do ViaCEP, e vazios
    // significam CEP nao encontrado (Spec 023, decisao A3).
    address: this.fb.nonNullable.group({
      zip: ['', [Validators.required, Validators.pattern(/^\d{5}-?\d{3}$/)]],
      street: ['', [Validators.required, Validators.maxLength(120)]],
      number: ['', [Validators.required, Validators.maxLength(20)]],
      complement: ['', [Validators.maxLength(60)]],
      district: ['', [Validators.required, Validators.maxLength(80)]],
      city: ['', [Validators.required]],
      cityIbge: ['', [Validators.required, Validators.pattern(/^\d{7}$/)]],
      state: ['', [Validators.required]],
    }),
  });

  /** Estado da consulta ao ViaCEP. */
  readonly cepState = signal<'idle' | 'loading' | 'found' | 'notfound'>('idle');
  readonly cityLabel = signal('');

  /** Obrigatorio para o `createCardToken`: vazio, o Mercado Pago recusa o token. */
  readonly cardholderName = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.maxLength(80),
  ]);
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
    this.watchZip();

    if (!this.hasSelection()) {
      this.store.loadCatalog().subscribe({ error: () => undefined });
    }
  }

  /**
   * CEP completo dispara o ViaCEP, que preenche logradouro, bairro, cidade, UF
   * e codigo IBGE. Logradouro e bairro continuam editaveis: o CEP geral de uma
   * cidade pequena vem sem eles, e o comprador corrige (decisao A3).
   */
  private watchZip(): void {
    const address = this.form.controls.address.controls;

    address.zip.valueChanges
      .pipe(
        map(value => value.replace(/\D/g, '')),
        distinctUntilChanged(),
        tap(() => {
          address.city.setValue('');
          address.cityIbge.setValue('');
          address.state.setValue('');
          this.cityLabel.set('');
          this.cepState.set('idle');
        }),
        switchMap(digits => {
          if (digits.length !== 8) {
            return EMPTY;
          }

          this.cepState.set('loading');

          return this.cep.lookup(digits);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(found => {
        if (!found) {
          this.cepState.set('notfound');

          return;
        }

        this.form.controls.address.patchValue({
          street: found.street || address.street.value,
          district: found.district || address.district.value,
          city: found.city,
          cityIbge: found.cityIbge,
          state: found.state,
        });
        this.cityLabel.set(found.city + ' / ' + found.state);
        this.cepState.set('found');
      });
  }

  /** O pagador como a API espera: CEP so com digitos, complemento so se houver. */
  private payer() {
    const { address, ...payer } = this.form.getRawValue();
    const complement = address.complement.trim();

    return {
      ...payer,
      document: cpfDigits(payer.document),
      address: {
        zip: address.zip.replace(/\D/g, ''),
        street: address.street.trim(),
        number: address.number.trim(),
        ...(complement ? { complement } : {}),
        district: address.district.trim(),
        city: address.city,
        cityIbge: address.cityIbge,
        state: address.state,
      },
    };
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

    if (method !== 'CREDIT_CARD') {
      return;
    }

    // O nome do cartao quase sempre e o do comprador: ja vem preenchido, e
    // quem paga com o cartao de outra pessoa corrige.
    if (!this.cardholderName.value) {
      const { firstName, lastName } = this.form.getRawValue();

      this.cardholderName.setValue(`${firstName} ${lastName}`.trim().toUpperCase());
    }

    this.cardOpenedState.set(true);

    // Os contêineres so existem depois que o Angular desenha o bloco do
    // cartao. Montar antes fazia o SDK so avisar no console ("Container not
    // found") e os campos ficavam vazios, sem como digitar.
    afterNextRender(() => void this.mountCardFields(), { injector: this.injector });
  }

  /** Erro de um Secure Field, depois que o comprador saiu dele. */
  cardFieldError(field: CardField): boolean {
    return this.cardInvalidState()[field] && this.cardTouchedState()[field];
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

    if (this.methodState() === 'CREDIT_CARD' && !this.cardReady()) {
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
        payer: this.payer(),
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
        typeof error === 'string'
          ? error
          : (cardTokenMessage(error) ?? 'Não foi possível concluir o pagamento. Tente de novo.'),
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
      identificationNumber: cpfDigits(this.form.getRawValue().document),
    });

    return {
      token: token.id,
      paymentMethodId: this.paymentMethodId,
      installments: Number(this.installmentsControl.value) || 1,
    };
  }

  private paymentMethodId = '';

  /**
   * Confere o cartao antes de cobrar: tudo o que o `createCardToken` e a API
   * exigem. Sem isso, um campo vazio virava "Nao foi possivel concluir o
   * pagamento", sem dizer qual.
   */
  private cardReady(): boolean {
    this.cardholderName.markAsTouched();
    this.cardTouchedState.set({ cardNumber: true, expirationDate: true, securityCode: true });

    if (!this.fieldsMounted()) {
      this.errorState.set('O formulário de cartão ainda está carregando. Tente de novo em instantes.');
      void this.mountCardFields();

      return false;
    }

    const invalid = this.cardInvalidState();

    if (invalid.cardNumber || invalid.expirationDate || invalid.securityCode) {
      this.errorState.set('Confira os dados do cartão destacados acima.');

      return false;
    }

    if (this.cardholderName.invalid) {
      this.errorState.set('Informe o nome como está impresso no cartão.');

      return false;
    }

    // A bandeira vem do BIN; vazia, a API recusa o pedido (`paymentMethodId`).
    if (!this.paymentMethodId) {
      this.errorState.set('Confira o número do cartão: não reconhecemos a bandeira.');

      return false;
    }

    return true;
  }

  /** Monta os Secure Fields e, a cada BIN, pede as parcelas ao gateway. */
  private async mountCardFields(): Promise<void> {
    if (this.fieldsMounted() || this.mounting) {
      return;
    }

    this.mounting = true;

    try {
      const sdk = await this.mp.load();
      const fields = {} as Record<CardField, SecureField>;

      for (const { type, placeholder, srLabel } of CARD_FIELDS) {
        const field = sdk.fields.create(type, {
          placeholder,
          srLabel,
          ariaRequired: true,
          style: SECURE_FIELD_STYLE,
        });

        field.on('validityChange', data =>
          this.setCardFlag(this.cardInvalidState, type, !!data?.errorMessages?.length),
        );
        field.on('blur', () => this.setCardFlag(this.cardTouchedState, type, true));
        fields[type] = field;
      }

      // O BIN e o que permite descobrir bandeira e parcelas antes do cartao
      // inteiro ser digitado. Os Secure Fields so o entregam pelo evento
      // `binChange`: uma opcao `onBinChange` no `create()` e ignorada pelo SDK.
      fields.cardNumber.on('binChange', data => this.onBinChange(sdk, fields, data?.bin));

      for (const { type } of CARD_FIELDS) {
        fields[type].mount(type);
      }

      // O `mount()` do SDK nao lanca erro quando falha: so avisa no console.
      // O iframe no contêiner e a unica prova de que o campo existe.
      const missing = CARD_FIELDS.some(
        ({ type }) => !document.getElementById(type)?.querySelector('iframe'),
      );

      if (missing) {
        throw new Error('Secure Fields sem iframe.');
      }

      this.fieldsMounted.set(true);
      this.errorState.set(null);
    } catch {
      this.errorState.set(
        'Não foi possível carregar o formulário de cartão. Tente o PIX ou recarregue a página.',
      );
    } finally {
      this.mounting = false;
    }
  }

  /**
   * Com o BIN, descobre a bandeira, ajusta os campos a ela (a American Express
   * tem 15 digitos e CVV de 4) e pede as parcelas.
   */
  private async onBinChange(
    sdk: MercadoPagoSdk,
    fields: Record<CardField, SecureField>,
    bin: string | undefined,
  ): Promise<void> {
    if (!bin || bin.length < 6) {
      this.installmentsState.set([]);
      this.paymentMethodId = '';
      this.lastBin = '';

      return;
    }

    this.lastBin = bin;

    try {
      const [methods, options] = await Promise.all([
        sdk.getPaymentMethods({ bin }),
        this.mp.installments(this.store.totalCents(), bin, this.maxInstallments()),
      ]);
      const method = methods.results?.[0];
      const settings = method?.settings?.[0];

      this.paymentMethodId = method?.id ?? '';
      this.installmentsState.set(options);
      this.installmentsControl.setValue(options[0]?.installments ?? 1);

      if (settings?.card_number) {
        fields.cardNumber.update({ settings: settings.card_number });
      }

      if (settings?.security_code) {
        fields.securityCode.update({ settings: settings.security_code });
      }
    } catch {
      // Sem bandeira, o `cardReady()` barra o envio com uma mensagem clara.
      this.paymentMethodId = '';
      this.installmentsState.set([]);
    }
  }

  private setCardFlag(
    state: WritableSignal<Record<CardField, boolean>>,
    field: CardField,
    value: boolean,
  ): void {
    state.update(current => ({ ...current, [field]: value }));
  }
}
