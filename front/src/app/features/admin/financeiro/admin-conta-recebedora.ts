import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AdminMercadoPagoService,
  ConnectionLink,
  ReceivingAccount,
} from '../../../core/services/admin-mercado-pago.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';

/** Texto de cada motivo de desconexao, em vez do codigo cru da API. */
const REASONS: Record<string, string> = {
  manual: 'A conta foi desconectada pelo painel.',
  replaced: 'A conta foi substituída por outra.',
  revoked:
    'O Mercado Pago recusou a renovação do acesso: a autorização foi revogada pelo vendedor ou venceu.',
};

/**
 * Bloco "Conta recebedora" da aba Financeiro (Spec 020, decisao 12).
 *
 * Mostra qual conta recebe as vendas deste ambiente, ate quando o acesso vale,
 * e gera o link que o dono da conta abre para autorizar. Sem conta, a loja
 * esta fechada, e o bloco diz isso em destaque. Desconectar pede confirmacao
 * na propria tela, sem dialogo do navegador.
 */
@Component({
  selector: 'app-admin-conta-recebedora',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Button, Card],
  template: `
    <ui-card variant="default" padding="lg" [hover]="false">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-brand-navy">Conta recebedora</h3>
          <p class="mt-1 text-sm text-slate-600">
            Conta do Mercado Pago que recebe 100% das vendas, sem comissão da plataforma.
          </p>
        </div>
        @if (account(); as current) {
          <ui-badge
            [variant]="current.environment === 'production' ? 'navy' : 'warning'"
            [label]="current.environment === 'production' ? 'Produção' : 'Ambiente de teste'" />
        }
      </div>

      @if (error(); as message) {
        <p class="mt-4 text-sm text-state-danger" role="alert">{{ message }}</p>
      }

      @if (account(); as current) {
        @if (current.status === 'connected') {
          <dl class="mt-5 grid gap-4 text-sm sm:grid-cols-2" data-testid="conta-conectada">
            <div>
              <dt class="text-xs font-bold uppercase tracking-widest text-slate-500">Conta</dt>
              <dd class="mt-1 font-semibold text-brand-navy">
                {{ current.account?.nickname ?? 'Conta ' + current.account?.mpUserId }}
              </dd>
              @if (current.account?.email) {
                <dd class="text-slate-600">{{ current.account?.email }}</dd>
              }
              <dd class="text-xs text-slate-500">ID {{ current.account?.mpUserId }}</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-widest text-slate-500">Conectada</dt>
              <dd class="mt-1 text-slate-700">{{ dateTime(current.connectedAt) }}</dd>
              <dd class="text-xs text-slate-500">por {{ current.connectedByEmail }}</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-widest text-slate-500">Acesso válido até</dt>
              <dd class="mt-1 text-slate-700">{{ dateTime(current.expiresAt) }}</dd>
              <dd class="text-xs text-slate-500">Renovado automaticamente antes de vencer.</dd>
            </div>
          </dl>

          @if (current.expiringSoon) {
            <p
              class="mt-4 rounded-xl bg-state-warning/10 p-3 text-sm text-state-warning"
              role="alert"
              data-testid="aviso-vencimento">
              O acesso vence em menos de 15 dias e a renovação automática ainda não aconteceu. Se a data
              chegar, a loja fecha: gere um link novo e peça ao dono da conta para autorizar de novo.
            </p>
          }
        } @else {
          <div
            class="mt-5 rounded-xl bg-state-danger/10 p-4 text-sm text-state-danger"
            role="alert"
            data-testid="loja-fechada">
            <p class="font-semibold">A loja está fechada: nenhuma conta recebe as vendas neste ambiente.</p>
            @if (reason(); as text) {
              <p class="mt-1">{{ text }}</p>
            }
            <p class="mt-1">Gere o link abaixo e envie ao dono da conta do Mercado Pago que vai receber.</p>
          </div>
        }

        @if (link(); as generated) {
          <div class="mt-5 rounded-xl bg-brand-teal/5 p-4" data-testid="link-gerado">
            <label for="link-conexao" class="block text-xs font-bold uppercase tracking-widest text-slate-500">
              Link de conexão
            </label>
            <div class="mt-2 flex flex-wrap gap-2">
              <input
                id="link-conexao"
                type="text"
                readonly
                [value]="generated.url"
                class="min-w-0 flex-1 rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-slate-700" />
              <ui-button variant="outline" size="sm" (click)="copy(generated.url)">
                {{ copied() ? 'Copiado' : 'Copiar' }}
              </ui-button>
            </div>
            <p class="mt-2 text-xs text-slate-600">
              Vale até {{ dateTime(generated.expiresAt) }} e só pode ser usado uma vez. Quem abrir entra na
              própria conta do Mercado Pago e autoriza; não precisa ter conta nesta plataforma. Gerar outro
              link invalida este.
            </p>
          </div>
        }

        <div class="mt-5 flex flex-wrap gap-2">
          @if (confirming()) {
            <p class="w-full text-sm text-slate-700" role="alert">
              Desconectar fecha a loja até outra conta ser conectada. Continuar?
            </p>
            <ui-button variant="danger" size="sm" [loading]="busy()" (click)="disconnect()">
              Desconectar e fechar a loja
            </ui-button>
            <ui-button variant="ghost" size="sm" (click)="confirming.set(false)">Cancelar</ui-button>
          } @else {
            <ui-button variant="primary" size="sm" [loading]="busy()" (click)="generate()">
              {{ connected() ? 'Trocar conta' : 'Gerar link de conexão' }}
            </ui-button>
            @if (connected()) {
              <ui-button variant="ghost" size="sm" (click)="confirming.set(true)">Desconectar</ui-button>
            }
          }
        </div>
      } @else if (!error()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Carregando a conta recebedora…</p>
      }
    </ui-card>
  `,
})
export class AdminContaRecebedora implements OnInit {
  private readonly service = inject(AdminMercadoPagoService);

  protected readonly account = signal<ReceivingAccount | null>(null);
  protected readonly link = signal<ConnectionLink | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);
  protected readonly copied = signal(false);

  protected readonly connected = computed(() => this.account()?.status === 'connected');

  /** Por que nao ha conta: o texto do motivo, ou nada se nunca houve. */
  protected readonly reason = computed(() => {
    const current = this.account();

    return current?.disconnectReason ? (REASONS[current.disconnectReason] ?? null) : null;
  });

  ngOnInit(): void {
    this.service.load().subscribe({
      next: account => this.account.set(account),
      error: (message: string) => this.error.set(message),
    });
  }

  protected generate(): void {
    this.busy.set(true);
    this.error.set(null);
    this.copied.set(false);
    this.service.createLink().subscribe({
      next: link => {
        this.busy.set(false);
        this.link.set(link);
      },
      error: (message: string) => {
        this.busy.set(false);
        this.error.set(message);
      },
    });
  }

  protected disconnect(): void {
    this.busy.set(true);
    this.error.set(null);
    this.service.disconnect().subscribe({
      next: account => {
        this.busy.set(false);
        this.confirming.set(false);
        this.account.set(account);
      },
      error: (message: string) => {
        this.busy.set(false);
        this.error.set(message);
      },
    });
  }

  /** Copia o link; sem permissao de area de transferencia, o campo segue ali. */
  protected copy(url: string): void {
    navigator.clipboard
      ?.writeText(url)
      .then(() => this.copied.set(true))
      .catch(() => this.copied.set(false));
  }

  protected dateTime(value: string | null): string {
    return value
      ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : '—';
  }
}
