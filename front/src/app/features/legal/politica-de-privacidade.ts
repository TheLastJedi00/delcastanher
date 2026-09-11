import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CONSENT_POLICY_VERSION } from '../../core/services/consent.service';
import { LegalPage, LegalSection } from './legal-page';

@Component({
  selector: 'app-politica-de-privacidade',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage],
  template: `
    <app-legal-page
      title="Política de Privacidade"
      summary="Como a Delcastanher trata os dados pessoais de visitantes e alunos, e quais direitos você pode exercer sobre eles."
      [sections]="sections"
      [policyVersion]="policyVersion" />
  `,
})
export class PoliticaDePrivacidade {
  protected readonly policyVersion = CONSENT_POLICY_VERSION;

  protected readonly sections: LegalSection[] = [
    {
      title: '1. Quem é o controlador dos dados',
      topics: [
        'Razão social, CNPJ e endereço da Delcastanher',
        'Papel de controladora dos dados tratados na plataforma',
      ],
    },
    {
      title: '2. Encarregado pelo tratamento de dados (DPO)',
      topics: [
        'Nome ou identificação do encarregado indicado (Art. 41 da LGPD)',
        'Canal de contato exclusivo para assuntos de dados pessoais',
        'Prazo de resposta assumido para as solicitações recebidas',
      ],
    },
    {
      title: '3. Dados pessoais coletados',
      topics: [
        'Dados de cadastro: nome, e-mail, telefone e CPF',
        'Dados de uso: progresso na trilha, conclusão de módulos e emissão de certificado',
        'Dados de navegação coletados por cookies, apenas após consentimento',
      ],
    },
    {
      title: '4. Finalidades e bases legais',
      topics: [
        'Execução do contrato para dar acesso ao curso e emitir certificado',
        'Consentimento como base para medição de audiência e campanhas',
        'Cumprimento de obrigação legal na guarda de registros fiscais e de acesso',
        'Legítimo interesse, quando invocado, com o teste de balanceamento correspondente',
      ],
    },
    {
      title: '5. Compartilhamento com terceiros',
      topics: [
        'Operadores usados (hospedagem, meio de pagamento, medição de audiência)',
        'Transferência internacional de dados, quando houver, e salvaguardas adotadas',
        'Ausência de venda de dados pessoais a terceiros',
      ],
    },
    {
      title: '6. Prazo de retenção',
      topics: [
        'Por quanto tempo cada categoria de dado é mantida',
        'Retenção do certificado emitido para permitir validação por terceiros',
        'Critério de descarte ou anonimização ao fim do prazo',
      ],
    },
    {
      title: '7. Direitos do titular',
      topics: [
        'Confirmação de tratamento, acesso, correção e portabilidade',
        'Anonimização, bloqueio ou eliminação de dados desnecessários',
        'Revogação do consentimento e informação sobre as consequências da recusa',
        'Como exercer cada direito e qual canal usar',
      ],
    },
    {
      title: '8. Segurança da informação',
      topics: [
        'Medidas técnicas e administrativas de proteção adotadas',
        'Procedimento de comunicação em caso de incidente de segurança',
      ],
    },
    {
      title: '9. Cookies e tecnologias semelhantes',
      topics: [
        'Remissão à Política de Cookies como documento detalhado',
        'Como a preferência registrada no banner controla o que é carregado',
      ],
    },
    {
      title: '10. Atualizações desta política',
      topics: [
        'Como mudanças são comunicadas e quando passam a valer',
        'Efeito de uma nova versão sobre o consentimento já registrado',
      ],
    },
  ];
}
