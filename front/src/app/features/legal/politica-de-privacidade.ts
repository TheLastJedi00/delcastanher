import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CONSENT_POLICY_VERSION } from '../../core/services/consent.service';
import { COMPANY, COMPANY_LOCATION } from './company-info';
import { LegalPage, LegalSection, p, ul } from './legal-page';

/**
 * Politica de Privacidade — documento em vigor (Spec 015).
 *
 * As secoes 1 a 14 e a Declaracao de Ciencia sao a transcricao **literal** do
 * texto entregue pelo juridico em 13/09/2026, guardado em
 * `.specs/015 - Juridico/notas-originais.md`. Nenhuma frase foi reescrita,
 * encurtada ou reordenada, e a numeracao e a do documento — nao a das dez
 * clausulas que a Spec 009 tinha desenhado como roteiro. Aquele roteiro
 * cumpriu o papel dele; agora quem manda e o texto revisado (decisao 1).
 *
 * Duas intervencoes, ambas deliberadas:
 *
 * - A secao 10 chegou com `[e-mail para assuntos de privacidade/LGPD]`,
 *   `[nome, se aplicavel]` e `[numero]` nao preenchidos. E-mail e telefone
 *   saem de `company-info.ts`; o Encarregado e **omitido** em vez de
 *   inventado, porque indica-lo e ato da controladora (Art. 41), nao escolha
 *   de implementacao (decisao 5).
 * - A secao 15 nao vem do juridico e diz isso na primeira linha. Ela existe
 *   porque a plataforma faz promessas concretas que um texto generico nao
 *   alcanca — dado de cartao que nunca chega aqui, cookie que so carrega apos
 *   consentimento, certificado que sobrevive a expiracao do acesso (decisao 2).
 *
 * O rodape repetido do PDF ("DELCASTANHER ... • Politica de Privacidade e
 * Protecao de Dados") e artefato de diagramacao, nao conteudo, e nao entra.
 */
@Component({
  selector: 'app-politica-de-privacidade',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage],
  template: `
    <app-legal-page
      title="Política de Privacidade e Proteção de Dados – LGPD"
      summary="Como a Delcastanher coleta, utiliza, armazena, compartilha e protege dados pessoais, e quais direitos você pode exercer sobre eles."
      [sections]="sections"
      [policyVersion]="policyVersion"
      [pending]="false">
      <!-- Fecha o documento e nao e clausula: vai fora da lista, em caixa
           propria, para nao se confundir com as secoes numeradas. -->
      <div class="rounded-xl border border-brand-navy/10 bg-white p-5 shadow-card">
        <p class="mb-2 text-sm font-bold uppercase tracking-wider text-brand-navy">
          Declaração de ciência
        </p>
        <p class="text-base leading-relaxed text-slate-600">
          Ao utilizar o site e, quando aplicável, ao fornecer seus dados pessoais, o usuário
          declara ter tido acesso a esta Política de Privacidade e estar ciente das condições
          nela descritas, sem prejuízo dos direitos assegurados pela legislação aplicável.
        </p>
      </div>
    </app-legal-page>
  `,
})
export class PoliticaDePrivacidade {
  protected readonly policyVersion = CONSENT_POLICY_VERSION;

  protected readonly sections: LegalSection[] = [
    {
      title: '1. Objetivo',
      body: [
        p(
          `A ${COMPANY.legalName}, pessoa jurídica de direito privado, inscrita no CNPJ sob nº ${COMPANY.cnpj}, com sede em ${COMPANY_LOCATION}, valoriza a privacidade e a proteção dos dados pessoais de seus clientes, alunos, visitantes, parceiros e demais usuários de seus canais digitais.`
        ),
        p(
          'Esta Política de Privacidade tem como objetivo explicar, de forma clara e transparente, como coletamos, utilizamos, armazenamos, compartilhamos e protegemos dados pessoais, em conformidade com a Lei Federal nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais (LGPD).'
        ),
      ],
    },
    {
      title: '2. Quem é o responsável pelo tratamento dos dados?',
      body: [
        p(
          `A ${COMPANY.legalName} atua como Controladora dos dados pessoais tratados no contexto de suas atividades, sendo responsável pelas principais decisões relacionadas ao tratamento desses dados.`
        ),
      ],
    },
    {
      title: '3. Quais dados podemos coletar?',
      body: [
        p('Dependendo da interação realizada com nosso site e nossos serviços, poderemos coletar:'),
        ul(
          'Nome completo;',
          'CPF, quando necessário;',
          'Data de nascimento, quando necessária;',
          'E-mail;',
          'Número de telefone/WhatsApp;',
          'Endereço;',
          'Dados profissionais;',
          'Informações relacionadas à inscrição em cursos e treinamentos;',
          'Dados necessários para emissão de certificados;',
          'Informações de pagamento e faturamento;',
          'Dados de acesso à plataforma de cursos;',
          'Endereço IP e informações técnicas do dispositivo e navegador;',
          'Dados de navegação e utilização do site;',
          'Informações fornecidas voluntariamente pelo usuário em formulários, pesquisas ou contatos.'
        ),
        p(
          'Não solicitaremos dados pessoais além daqueles necessários para as finalidades informadas, salvo quando houver fundamento legal para tratamento adicional.'
        ),
      ],
    },
    {
      title: '4. Para que utilizamos os dados?',
      body: [
        p('Os dados pessoais poderão ser utilizados para:'),
        ul(
          'Realizar cadastro de usuários e alunos;',
          'Processar inscrições e matrículas;',
          'Disponibilizar cursos, treinamentos e materiais;',
          'Emitir certificados;',
          'Processar pagamentos e emitir documentos fiscais;',
          'Entrar em contato com o usuário e responder dúvidas ou solicitações;',
          'Enviar informações relacionadas aos serviços contratados;',
          'Enviar comunicações e conteúdos promocionais, quando aplicável e autorizado;',
          'Melhorar nossos produtos, cursos, serviços e experiência do usuário;',
          'Cumprir obrigações legais e regulatórias;',
          'Prevenir fraudes e usos indevidos;',
          'Exercer direitos em processos judiciais, administrativos ou arbitrais;',
          'Garantir a segurança do site e das plataformas utilizadas.'
        ),
        p(
          'O tratamento será realizado com fundamento em uma das hipóteses legais previstas na LGPD, conforme a finalidade específica, incluindo execução de contrato, cumprimento de obrigação legal ou regulatória, legítimo interesse, exercício regular de direitos ou consentimento, quando aplicável.'
        ),
      ],
    },
    {
      title: '5. Compartilhamento de dados',
      body: [
        p(
          'Poderemos compartilhar dados pessoais, quando necessário, com prestadores de serviços e parceiros que auxiliem na operação do negócio, tais como:'
        ),
        ul(
          'Plataformas de hospedagem e gestão de cursos;',
          'Empresas de processamento de pagamentos;',
          'Serviços de emissão fiscal e contabilidade;',
          'Empresas de tecnologia e armazenamento em nuvem;',
          'Ferramentas de comunicação e atendimento;',
          'Empresas de marketing e análise de dados;',
          'Contadores, consultores e demais prestadores de serviços;',
          'Autoridades públicas, quando houver obrigação legal.'
        ),
        p(
          'Sempre que aplicável, buscamos estabelecer medidas contratuais e técnicas adequadas para proteção dos dados compartilhados.'
        ),
      ],
    },
    {
      title: '6. Cookies e tecnologias semelhantes',
      body: [
        p(
          'Nosso site poderá utilizar cookies e tecnologias semelhantes para permitir o funcionamento adequado do site, lembrar preferências do usuário, analisar desempenho e navegação, melhorar a experiência e, quando aplicável, realizar métricas e ações de marketing.'
        ),
        p(
          'O usuário poderá gerenciar determinadas preferências de cookies por meio das configurações disponibilizadas no site ou em seu navegador.'
        ),
      ],
    },
    {
      title: '7. Segurança dos dados',
      body: [
        p(
          `A ${COMPANY.shortName} adota medidas técnicas e administrativas razoáveis para proteger os dados pessoais contra acessos não autorizados, perda, destruição, alteração, divulgação ou qualquer forma de tratamento inadequado ou ilícito.`
        ),
        p(
          'Nenhum sistema eletrônico é completamente seguro. Por isso, recomendamos também que os usuários adotem boas práticas de segurança, especialmente na utilização de senhas e no acesso às plataformas.'
        ),
      ],
    },
    {
      title: '8. Por quanto tempo guardamos os dados?',
      body: [
        p(
          'Os dados pessoais serão mantidos pelo período necessário para cumprir as finalidades para as quais foram coletados. Após o encerramento da finalidade, os dados poderão ser mantidos quando houver fundamento legal para sua conservação, inclusive para cumprimento de obrigações legais, regulatórias ou para exercício regular de direitos.'
        ),
      ],
    },
    {
      title: '9. Direitos do titular',
      body: [
        p('Nos termos da LGPD, o titular poderá solicitar, entre outros direitos:'),
        ul(
          'Confirmação da existência de tratamento;',
          'Acesso aos seus dados pessoais;',
          'Correção de dados incompletos, inexatos ou desatualizados;',
          'Informações sobre o compartilhamento dos dados;',
          'Anonimização, bloqueio ou eliminação, quando aplicável;',
          'Portabilidade, observadas as regras legais e regulamentares;',
          'Revogação do consentimento, quando o tratamento estiver baseado nessa hipótese;',
          'Informações sobre as consequências de não fornecer determinado dado;',
          'Revisão de decisões tomadas exclusivamente com base em tratamento automatizado, quando aplicável.'
        ),
        p(
          'O exercício desses direitos observará as condições, limites e exceções previstos na legislação aplicável.'
        ),
      ],
    },
    {
      title: '10. Como exercer seus direitos?',
      body: [
        p(
          'Para solicitar informações ou exercer seus direitos relacionados à proteção de dados pessoais, o titular poderá entrar em contato conosco:'
        ),
        // O documento trazia tres marcadores aqui. E-mail e telefone vem da
        // secao 14, que chegou preenchida; a linha de Encarregado nao e
        // inventada (decisao 5).
        ul(`E-mail: ${COMPANY.email}`, `Telefone/WhatsApp: ${COMPANY.phone}`),
        p(
          'As solicitações serão analisadas de acordo com a legislação aplicável e poderão exigir procedimentos razoáveis para confirmação da identidade do solicitante.'
        ),
      ],
    },
    {
      title: '11. Dados de crianças e adolescentes',
      body: [
        p(
          'Nossos serviços não são direcionados a crianças ou adolescentes, salvo quando expressamente indicado. Quando houver tratamento de dados pessoais de crianças ou adolescentes, serão adotadas as medidas necessárias para atender à legislação aplicável e proteger seus melhores interesses.'
        ),
      ],
    },
    {
      title: '12. Transferência e armazenamento por terceiros',
      body: [
        p(
          `Dependendo das ferramentas utilizadas pela ${COMPANY.shortName}, determinados dados poderão ser armazenados ou processados por fornecedores de tecnologia, hospedagem, pagamentos, comunicação ou outros prestadores, inclusive em infraestrutura localizada fora do Brasil. Nesses casos, serão observadas as exigências aplicáveis da LGPD e adotadas medidas adequadas de proteção.`
        ),
      ],
    },
    {
      title: '13. Alterações desta política',
      body: [
        p(
          'Esta Política poderá ser atualizada periodicamente para refletir alterações legais, regulatórias, tecnológicas ou em nossos processos. A versão mais recente estará sempre disponível em nosso site, acompanhada da respectiva data de atualização.'
        ),
      ],
    },
    {
      title: '14. Contato',
      body: [
        p(
          `Em caso de dúvidas sobre esta Política de Privacidade ou sobre o tratamento de dados pessoais realizado pela ${COMPANY.shortName}, entre em contato:`
        ),
        ul(
          COMPANY.legalName,
          `CNPJ: ${COMPANY.cnpj}`,
          `E-mail: ${COMPANY.email}`,
          `Telefone: ${COMPANY.phone}`
        ),
      ],
    },
    {
      // Daqui para baixo o texto e da plataforma, e nao do juridico. A primeira
      // linha diz isso ao leitor: quem for revisar o documento sabe o que ainda
      // nao passou por advogado, e quem le sabe o que e complemento (decisao 2).
      title: '15. Informações específicas desta plataforma',
      body: [
        p(
          'As informações abaixo são um complemento operacional redigido pela Delcastanher, e não fazem parte do documento revisado pelo jurídico. Elas detalham, para esta plataforma de cursos, como as regras gerais das seções anteriores se aplicam na prática.'
        ),
        p(
          'Dados de cartão de crédito não são coletados, recebidos, registrados em log nem armazenados pela Delcastanher. Número, validade e código de segurança são digitados diretamente em campos seguros fornecidos pelo Mercado Pago, que é o operador responsável pelo processamento do pagamento. O que chega à nossa plataforma é apenas a autorização da compra e os dados necessários à cobrança e à prevenção de fraude, entre eles nome e CPF do comprador.'
        ),
        p(
          'Cookies e tecnologias de medição de audiência só são carregados após o consentimento do usuário, registrado no banner exibido na primeira visita. Enquanto não houver aceite, nenhuma ferramenta de medição é ativada. A escolha pode ser revista a qualquer momento pelo item "Preferências de cookies", disponível no rodapé do site, e uma nova versão desta Política reabre o pedido de consentimento. O detalhamento dos cookies utilizados está na Política de Cookies.'
        ),
        p(
          'A compra de um módulo concede acesso ao respectivo conteúdo pelo prazo de 6 meses, contado da aprovação do pagamento. Os dados do pedido — valor, meio de pagamento, situação e identificadores da transação — são mantidos como registro financeiro e fiscal, inclusive após o fim do prazo de acesso.'
        ),
        p(
          'O certificado emitido continua armazenado e válido depois de o acesso ao módulo expirar, para que possa ser verificado por terceiros na página pública de validação. Essa retenção é necessária à própria finalidade do certificado: um documento que deixasse de ser verificável perderia o sentido.'
        ),
      ],
    },
  ];
}
