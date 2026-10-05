import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Footer } from '../../shared/ui/footer/footer';
import { NavHeader } from '../../shared/ui/nav-header/nav-header';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

/**
 * Descadastro das campanhas de e-mail (`/descadastro`, Spec 023, decisao B5).
 *
 * O link do rodape traz um token HMAC e nao exige login. A pagina **pede
 * confirmacao por botao**: um descadastro no `GET` seria disparado pelo
 * antivirus que abre os links do e-mail para inspecionar. O "Cancelar
 * inscricao" nativo do Gmail nao passa por aqui — ele faz o `POST` direto na
 * API.
 */
@Component({
  selector: 'app-descadastro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card, Footer, NavHeader, PageContainer, SectionHeader],
  template: `
    <div class="flex min-h-screen flex-col bg-brand-surface">
      <ui-nav-header variant="landing" />

      <main class="flex-1">
        <ui-page-container maxWidth="md">
          <ui-section-header overline="E-mail" level="h1" title="Cancelar inscrição" />

          <ui-card variant="default" padding="lg" [hover]="false" class="mt-8 block">
            @switch (state()) {
              @case ('done') {
                <div role="status" data-testid="descadastrado">
                  <p class="text-lg font-semibold text-state-success">Inscrição cancelada</p>
                  <p class="mt-2 text-sm text-slate-600">
                    Você não vai mais receber as novidades da Imersão por e-mail. Os e-mails da sua
                    compra, como a nota fiscal, continuam chegando. Para voltar a receber, ligue
                    "Receber novidades por e-mail" em <a routerLink="/ava/perfil" class="text-brand-teal-deep underline">Meu Perfil</a>.
                  </p>
                </div>
              }
              @case ('invalid') {
                <div role="alert" data-testid="link-invalido">
                  <p class="text-lg font-semibold text-state-danger">Link inválido</p>
                  <p class="mt-2 text-sm text-slate-600">
                    Este link de descadastro está incompleto ou foi alterado. Use o link do rodapé
                    de um e-mail recente, ou desligue as novidades em Meu Perfil.
                  </p>
                </div>
              }
              @default {
                <p class="text-sm text-slate-600">
                  Confirme para deixar de receber as novidades da Imersão RH Estratégico por e-mail.
                  Os e-mails da sua compra, como a nota fiscal, continuam chegando.
                </p>
                @if (state() === 'error') {
                  <p class="mt-4 text-sm text-state-danger" role="alert">
                    Não foi possível concluir agora. Tente de novo em instantes.
                  </p>
                }
                <div class="mt-6">
                  <ui-button variant="primary" [loading]="state() === 'sending'" (click)="confirm()">
                    Confirmar descadastro
                  </ui-button>
                </div>
              }
            }
          </ui-card>
        </ui-page-container>
      </main>

      <ui-footer />
    </div>
  `,
})
export class Descadastro {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  private readonly token = toSignal(
    this.route.queryParamMap.pipe(map(params => params.get('token') ?? '')),
    { initialValue: '' },
  );

  private readonly result = signal<'idle' | 'sending' | 'done' | 'error' | 'invalid'>('idle');

  /** Sem token nao ha o que confirmar: a tela ja diz que o link esta errado. */
  readonly state = computed(() => (this.token() ? this.result() : 'invalid'));

  confirm(): void {
    if (this.result() === 'sending') {
      return;
    }

    this.result.set('sending');
    this.http
      .post(`${environment.apiUrl}/email/unsubscribe`, { token: this.token() })
      .subscribe({
        next: () => this.result.set('done'),
        error: (error: { status?: number }) =>
          this.result.set(error.status === 400 ? 'invalid' : 'error'),
      });
  }
}
