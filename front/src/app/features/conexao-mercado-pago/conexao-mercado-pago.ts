import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Card } from '../../shared/ui/card/card';
import { Footer } from '../../shared/ui/footer/footer';
import { NavHeader } from '../../shared/ui/nav-header/nav-header';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

interface Outcome {
  ok: boolean;
  title: string;
  detail: string;
}

/**
 * Texto fixo por motivo (Spec 020, decisao 5). A URL so carrega codigos
 * fechados, e nunca a mensagem do Mercado Pago: nada do que chega pela query
 * vira texto na tela.
 */
const FAILURES: Record<string, Omit<Outcome, 'ok'>> = {
  expirado: {
    title: 'Este link venceu',
    detail:
      'Links de conexão valem por 24 horas, e gerar um novo invalida os anteriores. Peça um link novo a quem administra a plataforma.',
  },
  usado: {
    title: 'Este link já foi usado',
    detail:
      'Cada link conecta uma conta uma única vez. Se a conexão não aparece no painel, peça um link novo.',
  },
  negado: {
    title: 'A autorização foi recusada',
    detail:
      'Nenhuma conta foi conectada. Se foi engano, abra o mesmo link de novo enquanto ele estiver no prazo e autorize.',
  },
  sem_offline_access: {
    title: 'A autorização veio incompleta',
    detail:
      'O Mercado Pago não liberou a renovação automática do acesso, e sem ela a conexão venceria em 6 meses. Fale com quem administra a plataforma.',
  },
};

const GENERIC_FAILURE: Omit<Outcome, 'ok'> = {
  title: 'Não foi possível conectar a conta',
  detail: 'Tente de novo com um link novo. Se continuar, fale com quem administra a plataforma.',
};

/**
 * Resultado da conexao da conta recebedora (`/conexao-mercado-pago`).
 *
 * Quem chega aqui e o dono da conta vendedora, voltando do Mercado Pago, e nao
 * precisa ter sessao na plataforma. A pagina so le a query que a propria API
 * montou — nao chama a API — e roda no navegador, fora do prerender e do
 * sitemap, com `noindex`.
 */
@Component({
  selector: 'app-conexao-mercado-pago',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, Footer, NavHeader, PageContainer, SectionHeader],
  template: `
    <div class="flex min-h-screen flex-col bg-brand-surface">
      <ui-nav-header variant="landing" />

      <main class="flex-1">
        <ui-page-container maxWidth="md">
          <ui-section-header overline="Mercado Pago" level="h1" title="Conexão da conta recebedora" />

          <ui-card variant="default" padding="lg" [hover]="false" class="mt-8 block">
            <div role="status" [attr.data-resultado]="outcome().ok ? 'ok' : 'erro'">
              <p
                class="text-lg font-semibold"
                [class.text-state-success]="outcome().ok"
                [class.text-state-danger]="!outcome().ok">
                {{ outcome().title }}
              </p>
              <p class="mt-2 text-sm text-slate-600">{{ outcome().detail }}</p>
            </div>
          </ui-card>
        </ui-page-container>
      </main>

      <ui-footer />
    </div>
  `,
})
export class ConexaoMercadoPago {
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly outcome = computed<Outcome>(() => {
    const params = this.query();

    if (params?.get('resultado') === 'ok') {
      return {
        ok: true,
        title: 'Conta conectada',
        detail:
          'A partir de agora, as vendas da plataforma caem nesta conta do Mercado Pago. Você já pode fechar esta página.',
      };
    }

    return { ok: false, ...(FAILURES[params?.get('motivo') ?? ''] ?? GENERIC_FAILURE) };
  });
}
