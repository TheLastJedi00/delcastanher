import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CONSENT_POLICY_VERSION } from '../../core/services/consent.service';
import { LegalPage, LegalSection } from './legal-page';

@Component({
  selector: 'app-termos-de-uso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage],
  template: `
    <app-legal-page
      title="Termos de Uso"
      summary="Condições que regem o acesso e o uso da plataforma Delcastanher, dos cursos e da área do aluno."
      [sections]="sections"
      [policyVersion]="policyVersion" />
  `,
})
export class TermosDeUso {
  protected readonly policyVersion = CONSENT_POLICY_VERSION;

  protected readonly sections: LegalSection[] = [
    {
      title: '1. Aceitação dos termos',
      topics: [
        'Quando o uso da plataforma configura aceite',
        'Idade mínima e capacidade civil para contratar',
        'Como alterações destes termos são comunicadas e a partir de quando valem',
      ],
    },
    {
      title: '2. Cadastro e conta de acesso',
      topics: [
        'Dados exigidos no cadastro e obrigação de mantê-los corretos',
        'Responsabilidade do aluno pela guarda da senha',
        'Vedação ao compartilhamento de acesso entre pessoas',
      ],
    },
    {
      title: '3. Matrícula, pagamento e acesso ao curso',
      topics: [
        'Formas de pagamento aceitas e momento da liberação do acesso',
        'Prazo de disponibilidade do conteúdo após a compra',
        'Consequência da inadimplência sobre o acesso',
      ],
    },
    {
      title: '4. Direito de arrependimento e reembolso',
      topics: [
        'Prazo de arrependimento previsto no Código de Defesa do Consumidor',
        'Como solicitar e em quanto tempo o valor é devolvido',
        'Prazo de garantia comercial oferecido, se houver, e como ele se soma ao legal',
      ],
    },
    {
      title: '5. Propriedade intelectual do conteúdo',
      topics: [
        'Titularidade das aulas, materiais e marca',
        'Licença de uso pessoal e intransferível concedida ao aluno',
        'Vedação a gravação, redistribuição e uso comercial do material',
      ],
    },
    {
      title: '6. Conduta esperada e suspensão de acesso',
      topics: [
        'Condutas que motivam suspensão ou encerramento da conta',
        'Procedimento antes da suspensão e direito de contestar',
      ],
    },
    {
      title: '7. Emissão de certificado',
      topics: [
        'Critério de conclusão que habilita a emissão',
        'Natureza do certificado e ausência de reconhecimento como pós-graduação',
        'Validação pública do certificado por terceiros',
      ],
    },
    {
      title: '8. Disponibilidade da plataforma',
      topics: [
        'Ausência de garantia de disponibilidade ininterrupta',
        'Janelas de manutenção e comunicação prévia',
        'Limites de responsabilidade por indisponibilidade',
      ],
    },
    {
      title: '9. Proteção de dados pessoais',
      topics: [
        'Remissão à Política de Privacidade como documento aplicável',
        'Base legal do tratamento vinculado à execução do contrato',
      ],
    },
    {
      title: '10. Foro e legislação aplicável',
      topics: [
        'Legislação brasileira aplicável',
        'Foro eleito para dirimir controvérsias',
      ],
    },
  ];
}
