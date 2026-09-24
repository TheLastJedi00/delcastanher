import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CONSENT_POLICY_VERSION, ConsentService } from '../../core/services/consent.service';
import { Button } from '../../shared/ui/button/button';
import { COMPANY } from './company-info';
import { LegalPage, LegalSection, p, ul } from './legal-page';

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
      [sections]="sections"
      [policyVersion]="policyVersion"
      [pending]="false">
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
      body: [
        p(
          'Cookies são pequenos arquivos que um site grava no seu navegador para reconhecê-lo em visitas seguintes. Tecnologias semelhantes — como o armazenamento local do navegador — cumprem a mesma função guardando informação no seu dispositivo, e recebem aqui o mesmo tratamento.'
        ),
        p(
          'Chamamos de próprio aquilo que é gravado pela própria Delcastanher, e de terceiro aquilo gravado por uma empresa contratada por nós, cujo conteúdo fica sob o domínio dela. Esta plataforma grava um único cookie próprio, necessário para manter você autenticado, e dois itens de armazenamento local — todos descritos na seção 2. Cookies de terceiro só existem no cenário da seção 3, e apenas após o seu aceite.'
        ),
      ],
    },
    {
      title: '2. Itens necessários ao funcionamento',
      body: [
        p(
          'O cookie abaixo é gravado pelo servidor da plataforma quando você entra na conta. Ele é inacessível a scripts da página, só trafega em conexão segura e só é enviado de volta à própria plataforma:'
        ),
        ul(
          '__Secure-refresh — mantém você autenticado na área do aluno entre uma página e outra, e entre visitas, para que não seja necessário entrar novamente a cada acesso. Vale por 30 dias, renovados a cada uso, e é apagado quando você sai da conta.'
        ),
        p(
          'Os itens abaixo são gravados no armazenamento local do seu navegador, permanecem no seu dispositivo e não são enviados a ninguém:'
        ),
        ul(
          'delcastanher.has-session — indica apenas que existe uma sessão aberta neste navegador, para que a plataforma saiba se deve retomá-la. Não contém nenhuma credencial e é apagado quando você sai da conta.',
          'delcastanher.consent — guarda a sua própria escolha sobre a medição de audiência, com a data em que foi feita e a versão desta política. É o registro que comprova o consentimento e o que impede o banner de perguntar de novo a cada página.'
        ),
        p(
          'Nenhum deles depende de consentimento prévio, e por motivos diferentes. Os dois primeiros são indispensáveis para prestar o serviço que você solicitou ao entrar na conta: sem eles, não há área do aluno. O último existe justamente para respeitar a sua escolha — pedir permissão para guardar a sua recusa tornaria impossível registrá-la. Recusar qualquer um deles significaria, na prática, não usar a plataforma.'
        ),
      ],
    },
    {
      title: '3. Medição de audiência',
      body: [
        p(
          'Para entender como o site é usado — quais páginas são visitadas, por qual caminho o visitante chega e em que ponto abandona a navegação — a plataforma pode utilizar o Google Tag Manager e as ferramentas de medição configuradas por meio dele, que atuam como operadores. O objetivo é agregado: melhorar o conteúdo e a experiência do site, e não identificar você individualmente.'
        ),
        p(
          'Essas ferramentas gravam cookies próprios, sob o domínio do fornecedor, e podem implicar transferência internacional de dados, tratada na seção 12 da Política de Privacidade.'
        ),
        p(
          'Nada disso é carregado antes do seu aceite. Enquanto você não aceitar, o script de medição não é inserido na página, nenhum cookie de terceiro é gravado e nenhum evento é enviado. Essa não é uma promessa de intenção: o carregamento está condicionado, no código da plataforma, ao registro de consentimento descrito na seção 2 — carregar "por precaução" antes da decisão já seria tratamento sem base legal.'
        ),
      ],
    },
    {
      title: '4. Como gerenciar sua escolha',
      body: [
        p(
          'Na primeira visita, um banner pergunta se você aceita a medição de audiência. Aceitar e recusar têm o mesmo peso e estão no mesmo lugar; nenhuma das opções está marcada de antemão.'
        ),
        p(
          'A escolha pode ser revista a qualquer momento, sem depender de contato conosco: use o botão no fim desta página ou o item "Preferências de cookies", presente no rodapé do site e da área do aluno. Revogar é tão simples quanto aceitar, e pode ser feito de qualquer tela.'
        ),
        p(
          'Recusar não limita nada do serviço contratado: cadastro, compra, aulas, progresso e certificado funcionam integralmente. O que deixa de existir é a medição da sua navegação.'
        ),
        p(
          'Cookies já gravados por terceiros antes de uma revogação continuam no seu navegador até que você os apague. Isso é feito pelas configurações do próprio navegador, na opção de limpar dados de navegação ou dados de sites — a plataforma não tem acesso para removê-los por você.'
        ),
      ],
    },
    {
      title: '5. Prazo de validade do consentimento',
      body: [
        p(
          'A escolha registrada permanece válida enquanto esta política não mudar de versão e enquanto o registro existir no seu navegador. Não há prazo fixo de expiração.'
        ),
        p(
          'Quando esta política é atualizada de forma relevante, a versão sobe e o consentimento dado sob a versão anterior deixa automaticamente de valer: o banner reaparece e a pergunta é refeita. É o que impede um aceite antigo de seguir autorizando uma política que você nunca leu. A versão vigente está indicada no fim desta página.'
        ),
        p(
          'O registro também se perde se você limpar os dados do navegador, usar outro navegador ou outro dispositivo, ou navegar em janela anônima — nesses casos o banner pergunta novamente, porque não há escolha registrada a consultar.'
        ),
      ],
    },
    {
      title: '6. Contato',
      body: [
        p(
          'Dúvidas sobre esta política, sobre os itens gravados no seu dispositivo ou sobre a medição de audiência podem ser enviadas para o mesmo canal de atendimento ao titular indicado na Política de Privacidade:'
        ),
        ul(`E-mail: ${COMPANY.email}`, `Telefone/WhatsApp: ${COMPANY.phone}`),
        p(
          'O tratamento completo de dados pessoais pela Delcastanher — quais dados coletamos, com que finalidade, com quem compartilhamos, por quanto tempo guardamos e quais direitos você pode exercer — está descrito na Política de Privacidade.'
        ),
      ],
    },
  ];
}
