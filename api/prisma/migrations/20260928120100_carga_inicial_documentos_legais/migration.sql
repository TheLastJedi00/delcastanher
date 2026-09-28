-- Spec 022, decisao 10: carga inicial dos documentos legais.
--
-- A Politica de Privacidade e a Politica de Cookies entram ja publicadas,
-- com o texto que estava no ar, `policyVersion = 2026-09-13` e
-- `changeKind = INITIAL`. Os Termos de Uso **nao** ganham versao: sao
-- publicados pelo painel quando o texto do juridico chegar.
--
-- Gerada por `npm run spec022:carga-legal`, a partir das `LegalSection` do
-- front, e nao redigitada. O script confere que o texto volta as mesmas
-- secoes pelo parser antes de escrever este arquivo.
--
-- Os dados da controladora (razao social, CNPJ, contato) entram como texto
-- literal: muda-los passa a ser uma publicacao de correcao pelo painel.
--
-- `ON CONFLICT DO NOTHING`: rodar de novo nao duplica nem sobrescreve.

INSERT INTO "legal_document_versions" ("id", "kind", "content", "policyVersion", "changeKind", "publishedAt", "publishedById", "publishedByEmail")
VALUES ('legal-privacy-2026-09-13', 'PRIVACY', $legal$## 1. Objetivo

A DELCASTANHER Serviços Administrativos e Treinamentos Ltda., pessoa jurídica de direito privado, inscrita no CNPJ sob nº 58.216.042/0001-44, com sede em Blumenau SC, valoriza a privacidade e a proteção dos dados pessoais de seus clientes, alunos, visitantes, parceiros e demais usuários de seus canais digitais.

Esta Política de Privacidade tem como objetivo explicar, de forma clara e transparente, como coletamos, utilizamos, armazenamos, compartilhamos e protegemos dados pessoais, em conformidade com a Lei Federal nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais (LGPD).

## 2. Quem é o responsável pelo tratamento dos dados?

A DELCASTANHER Serviços Administrativos e Treinamentos Ltda. atua como Controladora dos dados pessoais tratados no contexto de suas atividades, sendo responsável pelas principais decisões relacionadas ao tratamento desses dados.

## 3. Quais dados podemos coletar?

Dependendo da interação realizada com nosso site e nossos serviços, poderemos coletar:

- Nome completo;
- CPF, quando necessário;
- Data de nascimento, quando necessária;
- E-mail;
- Número de telefone/WhatsApp;
- Endereço;
- Dados profissionais;
- Informações relacionadas à inscrição em cursos e treinamentos;
- Dados necessários para emissão de certificados;
- Informações de pagamento e faturamento;
- Dados de acesso à plataforma de cursos;
- Endereço IP e informações técnicas do dispositivo e navegador;
- Dados de navegação e utilização do site;
- Informações fornecidas voluntariamente pelo usuário em formulários, pesquisas ou contatos.

Não solicitaremos dados pessoais além daqueles necessários para as finalidades informadas, salvo quando houver fundamento legal para tratamento adicional.

## 4. Para que utilizamos os dados?

Os dados pessoais poderão ser utilizados para:

- Realizar cadastro de usuários e alunos;
- Processar inscrições e matrículas;
- Disponibilizar cursos, treinamentos e materiais;
- Emitir certificados;
- Processar pagamentos e emitir documentos fiscais;
- Entrar em contato com o usuário e responder dúvidas ou solicitações;
- Enviar informações relacionadas aos serviços contratados;
- Enviar comunicações e conteúdos promocionais, quando aplicável e autorizado;
- Melhorar nossos produtos, cursos, serviços e experiência do usuário;
- Cumprir obrigações legais e regulatórias;
- Prevenir fraudes e usos indevidos;
- Exercer direitos em processos judiciais, administrativos ou arbitrais;
- Garantir a segurança do site e das plataformas utilizadas.

O tratamento será realizado com fundamento em uma das hipóteses legais previstas na LGPD, conforme a finalidade específica, incluindo execução de contrato, cumprimento de obrigação legal ou regulatória, legítimo interesse, exercício regular de direitos ou consentimento, quando aplicável.

## 5. Compartilhamento de dados

Poderemos compartilhar dados pessoais, quando necessário, com prestadores de serviços e parceiros que auxiliem na operação do negócio, tais como:

- Plataformas de hospedagem e gestão de cursos;
- Empresas de processamento de pagamentos;
- Serviços de emissão fiscal e contabilidade;
- Empresas de tecnologia e armazenamento em nuvem;
- Ferramentas de comunicação e atendimento;
- Empresas de marketing e análise de dados;
- Contadores, consultores e demais prestadores de serviços;
- Autoridades públicas, quando houver obrigação legal.

Sempre que aplicável, buscamos estabelecer medidas contratuais e técnicas adequadas para proteção dos dados compartilhados.

## 6. Cookies e tecnologias semelhantes

Nosso site poderá utilizar cookies e tecnologias semelhantes para permitir o funcionamento adequado do site, lembrar preferências do usuário, analisar desempenho e navegação, melhorar a experiência e, quando aplicável, realizar métricas e ações de marketing.

O usuário poderá gerenciar determinadas preferências de cookies por meio das configurações disponibilizadas no site ou em seu navegador.

## 7. Segurança dos dados

A DELCASTANHER adota medidas técnicas e administrativas razoáveis para proteger os dados pessoais contra acessos não autorizados, perda, destruição, alteração, divulgação ou qualquer forma de tratamento inadequado ou ilícito.

Nenhum sistema eletrônico é completamente seguro. Por isso, recomendamos também que os usuários adotem boas práticas de segurança, especialmente na utilização de senhas e no acesso às plataformas.

## 8. Por quanto tempo guardamos os dados?

Os dados pessoais serão mantidos pelo período necessário para cumprir as finalidades para as quais foram coletados. Após o encerramento da finalidade, os dados poderão ser mantidos quando houver fundamento legal para sua conservação, inclusive para cumprimento de obrigações legais, regulatórias ou para exercício regular de direitos.

## 9. Direitos do titular

Nos termos da LGPD, o titular poderá solicitar, entre outros direitos:

- Confirmação da existência de tratamento;
- Acesso aos seus dados pessoais;
- Correção de dados incompletos, inexatos ou desatualizados;
- Informações sobre o compartilhamento dos dados;
- Anonimização, bloqueio ou eliminação, quando aplicável;
- Portabilidade, observadas as regras legais e regulamentares;
- Revogação do consentimento, quando o tratamento estiver baseado nessa hipótese;
- Informações sobre as consequências de não fornecer determinado dado;
- Revisão de decisões tomadas exclusivamente com base em tratamento automatizado, quando aplicável.

O exercício desses direitos observará as condições, limites e exceções previstos na legislação aplicável.

## 10. Como exercer seus direitos?

Para solicitar informações ou exercer seus direitos relacionados à proteção de dados pessoais, o titular poderá entrar em contato conosco:

- E-mail: lidiane_delcastanher@hotmail.com
- Telefone/WhatsApp: 47-992908953

As solicitações serão analisadas de acordo com a legislação aplicável e poderão exigir procedimentos razoáveis para confirmação da identidade do solicitante.

## 11. Dados de crianças e adolescentes

Nossos serviços não são direcionados a crianças ou adolescentes, salvo quando expressamente indicado. Quando houver tratamento de dados pessoais de crianças ou adolescentes, serão adotadas as medidas necessárias para atender à legislação aplicável e proteger seus melhores interesses.

## 12. Transferência e armazenamento por terceiros

Dependendo das ferramentas utilizadas pela DELCASTANHER, determinados dados poderão ser armazenados ou processados por fornecedores de tecnologia, hospedagem, pagamentos, comunicação ou outros prestadores, inclusive em infraestrutura localizada fora do Brasil. Nesses casos, serão observadas as exigências aplicáveis da LGPD e adotadas medidas adequadas de proteção.

## 13. Alterações desta política

Esta Política poderá ser atualizada periodicamente para refletir alterações legais, regulatórias, tecnológicas ou em nossos processos. A versão mais recente estará sempre disponível em nosso site, acompanhada da respectiva data de atualização.

## 14. Contato

Em caso de dúvidas sobre esta Política de Privacidade ou sobre o tratamento de dados pessoais realizado pela DELCASTANHER, entre em contato:

- DELCASTANHER Serviços Administrativos e Treinamentos Ltda.
- CNPJ: 58.216.042/0001-44
- E-mail: lidiane_delcastanher@hotmail.com
- Telefone: 47-992908953

## 15. Informações específicas desta plataforma

As informações abaixo são um complemento operacional redigido pela Delcastanher, e não fazem parte do documento revisado pelo jurídico. Elas detalham, para esta plataforma de cursos, como as regras gerais das seções anteriores se aplicam na prática.

Dados de cartão de crédito não são coletados, recebidos, registrados em log nem armazenados pela Delcastanher. Número, validade e código de segurança são digitados diretamente em campos seguros fornecidos pelo Mercado Pago, que é o operador responsável pelo processamento do pagamento. O que chega à nossa plataforma é apenas a autorização da compra e os dados necessários à cobrança e à prevenção de fraude, entre eles nome e CPF do comprador.

Cookies e tecnologias de medição de audiência só são carregados após o consentimento do usuário, registrado no banner exibido na primeira visita. Enquanto não houver aceite, nenhuma ferramenta de medição é ativada. A escolha pode ser revista a qualquer momento pelo item "Preferências de cookies", disponível no rodapé do site, e uma nova versão desta Política reabre o pedido de consentimento. O detalhamento dos cookies utilizados está na Política de Cookies.

A compra de um módulo concede acesso ao respectivo conteúdo pelo prazo de 6 meses, contado da aprovação do pagamento. Os dados do pedido — valor, meio de pagamento, situação e identificadores da transação — são mantidos como registro financeiro e fiscal, inclusive após o fim do prazo de acesso.

O certificado emitido continua armazenado e válido depois de o acesso ao módulo expirar, para que possa ser verificado por terceiros na página pública de validação. Essa retenção é necessária à própria finalidade do certificado: um documento que deixasse de ser verificável perderia o sentido.$legal$, '2026-09-13', 'INITIAL', '2026-09-13 12:00:00', NULL, NULL)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "legal_document_versions" ("id", "kind", "content", "policyVersion", "changeKind", "publishedAt", "publishedById", "publishedByEmail")
VALUES ('legal-cookies-2026-09-13', 'COOKIES', $legal$## 1. O que são cookies

Cookies são pequenos arquivos que um site grava no seu navegador para reconhecê-lo em visitas seguintes. Tecnologias semelhantes — como o armazenamento local do navegador — cumprem a mesma função guardando informação no seu dispositivo, e recebem aqui o mesmo tratamento.

Chamamos de próprio aquilo que é gravado pela própria Delcastanher, e de terceiro aquilo gravado por uma empresa contratada por nós, cujo conteúdo fica sob o domínio dela. Esta plataforma grava um único cookie próprio, necessário para manter você autenticado, e dois itens de armazenamento local — todos descritos na seção 2. Cookies de terceiro só existem no cenário da seção 3, e apenas após o seu aceite.

## 2. Itens necessários ao funcionamento

O cookie abaixo é gravado pelo servidor da plataforma quando você entra na conta. Ele é inacessível a scripts da página, só trafega em conexão segura e só é enviado de volta à própria plataforma:

- __Secure-refresh — mantém você autenticado na área do aluno entre uma página e outra, e entre visitas, para que não seja necessário entrar novamente a cada acesso. Vale por 30 dias, renovados a cada uso, e é apagado quando você sai da conta.

Os itens abaixo são gravados no armazenamento local do seu navegador, permanecem no seu dispositivo e não são enviados a ninguém:

- delcastanher.has-session — indica apenas que existe uma sessão aberta neste navegador, para que a plataforma saiba se deve retomá-la. Não contém nenhuma credencial e é apagado quando você sai da conta.
- delcastanher.consent — guarda a sua própria escolha sobre a medição de audiência, com a data em que foi feita e a versão desta política. É o registro que comprova o consentimento e o que impede o banner de perguntar de novo a cada página.

Nenhum deles depende de consentimento prévio, e por motivos diferentes. Os dois primeiros são indispensáveis para prestar o serviço que você solicitou ao entrar na conta: sem eles, não há área do aluno. O último existe justamente para respeitar a sua escolha — pedir permissão para guardar a sua recusa tornaria impossível registrá-la. Recusar qualquer um deles significaria, na prática, não usar a plataforma.

## 3. Medição de audiência

Para entender como o site é usado — quais páginas são visitadas, por qual caminho o visitante chega e em que ponto abandona a navegação — a plataforma pode utilizar o Google Tag Manager e as ferramentas de medição configuradas por meio dele, que atuam como operadores. O objetivo é agregado: melhorar o conteúdo e a experiência do site, e não identificar você individualmente.

Essas ferramentas gravam cookies próprios, sob o domínio do fornecedor, e podem implicar transferência internacional de dados, tratada na seção 12 da Política de Privacidade.

Nada disso é carregado antes do seu aceite. Enquanto você não aceitar, o script de medição não é inserido na página, nenhum cookie de terceiro é gravado e nenhum evento é enviado. Essa não é uma promessa de intenção: o carregamento está condicionado, no código da plataforma, ao registro de consentimento descrito na seção 2 — carregar "por precaução" antes da decisão já seria tratamento sem base legal.

## 4. Como gerenciar sua escolha

Na primeira visita, um banner pergunta se você aceita a medição de audiência. Aceitar e recusar têm o mesmo peso e estão no mesmo lugar; nenhuma das opções está marcada de antemão.

A escolha pode ser revista a qualquer momento, sem depender de contato conosco: use o botão no fim desta página ou o item "Preferências de cookies", presente no rodapé do site e da área do aluno. Revogar é tão simples quanto aceitar, e pode ser feito de qualquer tela.

Recusar não limita nada do serviço contratado: cadastro, compra, aulas, progresso e certificado funcionam integralmente. O que deixa de existir é a medição da sua navegação.

Cookies já gravados por terceiros antes de uma revogação continuam no seu navegador até que você os apague. Isso é feito pelas configurações do próprio navegador, na opção de limpar dados de navegação ou dados de sites — a plataforma não tem acesso para removê-los por você.

## 5. Prazo de validade do consentimento

A escolha registrada permanece válida enquanto esta política não mudar de versão e enquanto o registro existir no seu navegador. Não há prazo fixo de expiração.

Quando esta política é atualizada de forma relevante, a versão sobe e o consentimento dado sob a versão anterior deixa automaticamente de valer: o banner reaparece e a pergunta é refeita. É o que impede um aceite antigo de seguir autorizando uma política que você nunca leu. A versão vigente está indicada no fim desta página.

O registro também se perde se você limpar os dados do navegador, usar outro navegador ou outro dispositivo, ou navegar em janela anônima — nesses casos o banner pergunta novamente, porque não há escolha registrada a consultar.

## 6. Contato

Dúvidas sobre esta política, sobre os itens gravados no seu dispositivo ou sobre a medição de audiência podem ser enviadas para o mesmo canal de atendimento ao titular indicado na Política de Privacidade:

- E-mail: lidiane_delcastanher@hotmail.com
- Telefone/WhatsApp: 47-992908953

O tratamento completo de dados pessoais pela Delcastanher — quais dados coletamos, com que finalidade, com quem compartilhamos, por quanto tempo guardamos e quais direitos você pode exercer — está descrito na Política de Privacidade.$legal$, '2026-09-13', 'INITIAL', '2026-09-13 12:00:00', NULL, NULL)
ON CONFLICT ("id") DO NOTHING;
