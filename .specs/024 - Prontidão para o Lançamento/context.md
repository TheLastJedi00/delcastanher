# Spec 024: Prontidão para o Lançamento

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:**
- Spec 014 (Checkout)
- Spec 019 (Preços, Pacote e Lotes)
- Spec 020 (Recebimento na Conta do Vendedor)
- Spec 022 (Políticas e Termos pelo Painel)
- Spec 023 (Disparos de E-mail e Nota Fiscal)
- Lista de validação enviada pela cliente em 2026-10-05

**Escopo técnico:** full-stack, mas a maior parte é **operação**: configuração, conteúdo e verificação. Código novo: e-mail de confirmação de compra, botão "Baixar PDF" do certificado, links do rodapé e os bugs da Gestão de Aulas. Também entram as correções que as auditorias de celular, links e velocidade encontrarem.

## Objetivo
Deixar a plataforma em condição de ser **entregue à cliente e aberta aos alunos**. O critério para um item estar aqui é um só: **sem ele não dá para lançar**. Pode ser por obrigação legal, por não receber o pagamento, por um produto incompleto ou por algo quebrado à vista do visitante.

O que pode ser feito depois do lançamento, sem afetar a cliente nem os alunos, está na **Spec 025**.

## A lista da cliente (2026-10-05)
A cliente vai validar a plataforma como alguém que conhece a Delcastanher pela primeira vez: entrar no site, entender a proposta, conhecer os módulos, escolher o plano, comprar, receber a confirmação e acessar a plataforma.

Cruzando a lista dela com o estado do código em 2026-10-05:

| Área da cliente | Já atende | Falta (e onde está) |
|---|---|---|
| Página de planos | Pacote com lotes, 12 avulsos, condições de pagamento, descrições | Preço real dos avulsos (D3). Placeholders de texto comercial (D9) |
| Botões e links | Compra levando ao checkout, menu, WhatsApp no `/planos` e na página do curso | Rodapé: LinkedIn e Instagram em `#`, telefone sem WhatsApp (D10). Varredura de links quebrados (D10). Termos de Uso "em preparação" (D2) |
| Processo de compra | Checkout PIX e cartão, confirmação na tela, liberação automática do acesso | Conta recebedora conectada (D4). **E-mail de confirmação da compra** (D6). Teste de ponta a ponta (D5). Nota fiscal (D1) |
| Área do aluno | Login, criação de conta, "Esqueci minha senha" (Firebase), liberação por módulo, certificado (Spec 023, Parte D) | Vídeos e materiais publicados (D7). Certificado com rubrica, carga horária e "Baixar PDF" (D8) |
| Celular | Telas responsivas por construção | Auditoria formal em celular de landing, `/planos`, loja, checkout e área do aluno (D11) |
| Parte técnica | SEO e compartilhamento (Spec 009, `og:` conferido em produção), mensagens de erro | Velocidade e imagens medidas (D12). E-mails ativos (D1 e D6) |

## Decisões

**D1. Nota fiscal antes da primeira venda.** A emissão de NF-e por venda é obrigação legal. O código está pronto (Spec 023, Parte A) e emissão sem `NOTAAS_API_KEY` fica desligada. Falta a cadeia de configuração, nesta ordem:
1. contador;
2. certificado A1;
3. Notaas (conta, suporte e sondagem);
4. variáveis na Vercel e webhook;
5. backfill do CPF;
6. teste no preview e na primeira venda real.

O e-mail da nota sai pelo Resend, então o domínio `mail.delcastanher.srv.br` verificado também está aqui. As tasks são as da Spec 023 (Fases 1 e 6), e esta spec só as reúne como bloqueio de lançamento, sem repetir o detalhe.

**D2. Textos legais publicados.**
- Os **Termos de Uso** precisam estar publicados. Hoje `/termos-de-uso` diz "em preparação". Depende do texto do jurídico, e a cliente publica pelo painel (Spec 022).
- A **Política de Privacidade** precisa citar a nota fiscal como finalidade do CPF e do endereço, que o checkout já coleta, e o e-mail transacional (D6).

**D3. Preço real de cada módulo.** Os 12 módulos estão nos R$ 199,00 provisórios da migration da Spec 014. É decisão comercial da cliente, feita pelo painel e sem deploy.

**D4. Conta recebedora conectada em produção (Spec 020).** Sem ela o checkout mostra "Pagamentos temporariamente indisponíveis" e a API responde 503. A ordem:
1. URL de retorno do OAuth no preview;
2. verificação em sandbox;
3. a cliente autoriza a conta real;
4. taxas do gateway cadastradas.

**D5. Um teste de ponta a ponta da compra, no lugar de vários.** Juntam-se:
- o teste funcional do checkout (Spec 014, task 9.6);
- a compra do pacote (Spec 019, task 7.8);
- a verificação em sandbox da conta recebedora (Spec 020).

O roteiro único:
1. conta nova e onboarding;
2. módulo avulso por cartão aprovado e por cartão recusado;
3. dois módulos por PIX e PIX expirado;
4. pacote por PIX e por cartão;
5. acesso liberado com 6 meses;
6. e-mail de confirmação (D6);
7. nota de homologação (D1);
8. pedido no financeiro.

O bloqueio comum são as **credenciais de sandbox da Orders API**: a conta do vendedor de teste precisa de uma aplicação própria.

Fecha com o **fluxo completo da cliente**: uma pessoa nova, do site ao acesso, no celular e no computador.

**D6. E-mail de confirmação da compra.** A cliente espera "e-mails/avisos ao cliente". Hoje a confirmação só aparece na tela. A Spec 023 deixou e-mails transacionais além da nota fora de escopo, e o `MailService` dela é a base deste.
- **Gatilho:** a transição para `PAID` em `OrdersService.apply`, no mesmo ponto que concede o acesso e emite a nota. Só a chamada que muda o estado envia, então o e-mail sai uma vez só.
- **Conteúdo:** módulos comprados, valor, método, validade do acesso (6 meses) e botão "Acessar a plataforma" para `/ava`. É transacional: ignora o descadastro de marketing e não leva `List-Unsubscribe` (mesma regra do e-mail da nota, decisão B5 da 023).
- **Falha:** como na nota, uma falha do Resend nunca desfaz nem atrasa o pagamento. Ela fica em log, e o pedido ganha `confirmationEmailedAt` para o painel mostrar e reenviar.
- **PIX pendente:** o lembrete fica fora (Spec 025). O QR já aparece na tela.

**D7. Conteúdo publicado, com o painel de aulas confiável.** Sem vídeo, a loja vende módulo vazio. Antes de a cliente publicar os 12 módulos, saem os três bugs da Gestão de Aulas:
- o estado vazio que aparece durante o carregamento, com risco de aula duplicada;
- a contagem de materiais que não atualiza;
- a corrida entre respostas ao trocar de módulo.

**D8. Certificado completo.**
- carga horária de cada módulo (painel, Spec 023, task 8.7);
- rubrica digitalizada no lugar de `[ASSINATURA DA COORDENAÇÃO]`, como imagem estática em `front/public/assets/`;
- botão **"Baixar PDF"** (Spec 023, task 8.9);
- teste de impressão (task 8.8).

**Decisão do usuário (2026-10-05): o PDF é gerado no navegador.**
- html2canvas + jsPDF, a partir da mesma folha `ui-certificado` que o aluno vê. Assim não há uma segunda versão do layout no servidor, nem rota ou custo novo na API.
- O preço: o texto do PDF vira imagem e não dá para selecionar nem buscar. O código e o hash continuam legíveis e conferíveis no portal público.
- As duas bibliotecas só carregam no clique (`import()` dinâmico), para não pesar na área do aluno.
- A folha é renderizada sempre com a largura do A4 (1123 px), independente da tela, para o PDF do celular sair igual ao do computador.

**D9. Nenhum placeholder visível ao visitante.** Cada um é substituído pelo conteúdo real ou **retirado da tela**. Lançar com "[CURSO A SER CADASTRADO]" parece site inacabado. Os placeholders:
- cursos futuros em `plans.mock.ts` e `courses.mock.ts`;
- depoimentos e garantias;
- logo da Cronus.

O que a cliente não fornecer até o lançamento sai da tela, sem ficar como pendente.

**D10. Links e contato.**
- LinkedIn e Instagram do rodapé com os endereços reais, que a cliente passa.
- WhatsApp no rodapé (`wa.me/5547992908953`), ao lado do telefone. Hoje o rodapé só tem `tel:`.
- Varredura de todos os links internos e externos do site publicado. Nenhum `#` solto, nenhum 404.

**D11. Auditoria no celular.** Em cerca de 390 px e 768 px, em:
- landing;
- `/planos`;
- página do curso;
- loja e checkout (as três etapas e o PIX);
- login e onboarding;
- Hub, trilha com o player, materiais e certificado;
- menus.

Critério da cliente: nada cortado ou desalinhado, botões alcançáveis, sem rolagem horizontal. Corrige-se tudo o que quebrar. Refinamentos de acessibilidade além disso ficam na Spec 025.

**D12. Velocidade e imagens medidas.** Lighthouse no celular para landing, `/planos` e página do curso. Corrige-se só o que for crítico (LCP acima de 4 s, imagem sem dimensão, imagem pesada no topo). O resto fica registrado para a Spec 025.

**D13. Lançamento.**
1. `release/023` na `main` e deploy.
2. Limpeza dos dados de teste, por último, com backup do Neon antes. Contas, pedidos, acessos e progresso de teste dividem o banco com os reais.

## Fora de escopo (Spec 025)
- Tela de acesso expirado: o acesso dura 6 meses, então ninguém expira antes disso.
- Campanhas de marketing: bug do segmento e teste no Gmail e no Outlook.
- Lembrete de PIX pendente por e-mail.
- Rótulo "DOC" dos `.pptx`.
- `h1` no `/admin` e acessibilidade fina da loja, do checkout e do `/planos`.
- Logo do Mercado Pago e selos de segurança.
- Vídeo da landing.
- Confirmações ao vivo já cobertas por testes automáticos.
- Melhorias de velocidade não críticas.
