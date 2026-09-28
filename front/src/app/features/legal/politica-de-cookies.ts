import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CONSENT_POLICY_VERSION, ConsentService } from '../../core/services/consent.service';
import { Button } from '../../shared/ui/button/button';
import { legalDocumentState } from './legal-document-state';
import { LegalPage } from './legal-page';

/**
 * Politica de Cookies — documento em vigor (Spec 015, decisao 3).
 *
 * Diferente da Politica de Privacidade, esta pagina nao transcreve texto de
 * advogado: ela descreve o comportamento do proprio sistema. O que a Spec 009
 * (decisao 11) protegia era clausula contratual — obrigacao, prazo, reembolso,
 * foro —, que depende de revisao juridica. Dizer quais chaves o site grava, com
 * que finalidade e por quanto tempo e trabalho de quem escreveu o site, e a
 * resposta esta no `ConsentService` e no `AnalyticsService`, nao em
 * jurisprudencia.
 *
 * Por isso cada afirmacao daqui foi conferida contra o codigo, e nao herdada de
 * modelo de politica de cookies. Descrever um cookie que nao existe seria o
 * mesmo erro de redigir clausula plausivel — texto que parece certo e nao
 * corresponde ao que o sistema faz.
 *
 * Desde a Spec 017 a plataforma grava **um** cookie proprio: o
 * `__Secure-refresh`, HttpOnly, emitido pela API para manter a sessao. Ele e
 * necessario, nao depende de consentimento, e por isso nao sobe a
 * `CONSENT_POLICY_VERSION`: o que o banner pergunta — a medicao de audiencia —
 * nao mudou.
 */
@Component({
  selector: 'app-politica-de-cookies',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage, Button, DatePipe],
  template: `
    <app-legal-page
      title="Política de Cookies"
      summary="O que a plataforma guarda no seu navegador, para que serve, o que só existe depois do seu aceite e como revisar a sua escolha a qualquer momento."
      [state]="state()"
      unpublishedNotice="A Política de Cookies está em preparação e será publicada nesta página.">
      <!-- A revogacao vive na propria pagina que explica o que foi consentido:
           mandar o titular procurar o controle em outro lugar e atrito. -->
      <div class="rounded-xl border border-brand-navy/10 bg-white p-5 shadow-card">
        <p class="mb-1 text-sm font-bold text-brand-navy">Sua escolha atual</p>
        <p class="mb-4 text-sm leading-relaxed text-slate-600">
          @if (record(); as decision) {
            {{ decision.choice === 'accepted' ? 'Você aceitou' : 'Você recusou' }} os cookies de
            medição em {{ decision.decidedAt | date: 'dd/MM/yyyy, HH:mm' }}, sob a versão
            {{ decision.policyVersion }} desta política.
          } @else {
            Você ainda não registrou uma escolha nesta versão da política.
          }
        </p>
        <ui-button variant="outline" size="sm" (click)="consent.reopen()">
          Rever preferências de cookies
        </ui-button>
      </div>
    </app-legal-page>
  `,
})
export class PoliticaDeCookies {
  protected readonly consent = inject(ConsentService);
  protected readonly record = this.consent.current;
  protected readonly state = legalDocumentState('COOKIES');
}
