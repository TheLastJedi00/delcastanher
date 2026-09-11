import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CONSENT_POLICY_VERSION, ConsentService } from '../../core/services/consent.service';
import { Button } from '../../shared/ui/button/button';
import { LegalPage, LegalSection } from './legal-page';

@Component({
  selector: 'app-politica-de-cookies',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage, Button, DatePipe],
  template: `
    <app-legal-page
      title="Política de Cookies"
      summary="Quais cookies a plataforma usa, para que servem e como revisar a sua escolha a qualquer momento."
      [sections]="sections"
      [policyVersion]="policyVersion">
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
  protected readonly policyVersion = CONSENT_POLICY_VERSION;

  protected readonly sections: LegalSection[] = [
    {
      title: '1. O que são cookies',
      topics: [
        'Definição de cookie e de tecnologias semelhantes usadas na plataforma',
        'Diferença entre cookie próprio e de terceiro',
      ],
    },
    {
      title: '2. Cookies necessários',
      topics: [
        'Manutenção da sessão do aluno autenticado na área do aluno',
        'Registro da própria escolha de consentimento',
        'Por que estes não dependem de consentimento prévio',
      ],
    },
    {
      title: '3. Cookies de medição de audiência',
      topics: [
        'Quais métricas de navegação são coletadas e com que finalidade',
        'Ferramenta de análise utilizada e o papel dela como operadora',
        'Confirmação de que nada é carregado antes do aceite',
      ],
    },
    {
      title: '4. Como gerenciar sua escolha',
      topics: [
        'Uso do banner e do acionador permanente no rodapé',
        'Efeito prático de recusar sobre o funcionamento da plataforma',
        'Como apagar cookies já gravados pelas configurações do navegador',
      ],
    },
    {
      title: '5. Prazo de validade do consentimento',
      topics: [
        'Por quanto tempo a escolha registrada permanece válida',
        'Reabertura do pedido quando esta política muda de versão',
      ],
    },
    {
      title: '6. Contato',
      topics: [
        'Canal do encarregado (DPO) para dúvidas sobre cookies',
        'Remissão à Política de Privacidade para o tratamento completo',
      ],
    },
  ];
}
