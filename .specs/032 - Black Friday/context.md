# Spec 032: Black Friday

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 014 (Checkout), Spec 016 (Painel de Finanças), Spec 019 (Preços, Pacote e Lotes), Spec 023 (Nota Fiscal), Spec 027 (Preço Único do Pacote), Spec 029 (Ambiente de Preview) e Spec 031 (Nota Fiscal Só em Produção)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma + Jest), com uma migration de schema, e `front/` (Angular standalone + signals + Tailwind, com SSR). O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo
Permitir que o administrador lance, pelo **Financeiro**, uma campanha de desconto com **porcentagem** e **duração** (início e fim). Enquanto a campanha vale:

- a loja, o `/planos` e a página do curso mostram o **preço antigo riscado** e o **preço novo**, com a **data e a hora em que a oferta acaba**;
- cards animados "pulam" na tela com a **contagem regressiva** e a **porcentagem** de desconto;
- o pedido é cobrado com o desconto, calculado **pelo servidor**.

Quando a campanha acaba, tudo volta ao preço normal sozinho, sem deploy e sem ninguém precisar desligar nada.

Junto, a seção **"Quem será sua Mentora"** da landing ganha as frases novas que o usuário vai definir (seção "Textos da mentora", abaixo).

## Prazo

- A Black Friday de 2026 é na **sexta, 27/11/2026**. Hoje é 15/11/2026.
- Para a campanha ser cadastrada com folga e testada no preview, o merge em produção deve sair até **segunda, 23/11/2026**.
- Se o prazo apertar, a Fase 4 (cards animados) pode sair depois da Fase 3 (preço riscado na loja): sem os cards, a campanha já funciona e já vende com desconto.

## Situação atual (lida no código em 15/11/2026)

- **Pacote:** `imersao-rh-lancamento`, um lote vigente, "Preço único", R$ 989,00, sem limite (Spec 027). O pedido de pacote grava `amountCents = tier.priceCents` e rateia o valor nos itens pelo `allocateByWeight` (`api/src/payments/bundles.service.ts`).
- **Módulos avulsos:** o preço sai de `Module.priceCents` e é congelado no `OrderItem.priceCents` (`OrdersService.resolveItems`). O `amountCents` é a soma dos itens.
- **Âncora riscada já existe:** o `ui-bundle-price` mostra "Valor dos módulos separadamente: ~~R$ 2.564,00~~" acima do preço do pacote.
- **O cliente nunca manda preço:** manda ids de módulo ou o slug do pacote (Spec 014, decisão 2). Esta spec mantém a regra.
- **O financeiro, o estorno e a NFS-e** leem `amountCents` e `OrderItem.priceCents`. Se esses dois valores já saírem com desconto, toda a cadeia continua certa sem mudança.
- **Pagamento de teste** (Spec 030): R$ 1,00 fixo, fora da receita. Não recebe desconto.

## Escopo

- **API:** modelo de campanha (`Promotion`), CRUD do admin, oferta pública da campanha vigente, desconto aplicado na criação do pedido, snapshot do desconto no pedido.
- **API:** o financeiro mostra o desconto concedido no período e marca os pedidos da campanha.
- **Front, painel:** card "Campanha de desconto" no Financeiro, para criar, editar, encerrar antes da hora e ver as campanhas passadas.
- **Front, vitrine:** preço antigo riscado + preço novo + "Oferta válida até 27/11 às 23h59" na loja, no `/planos`, na página do curso e no resumo do pagamento.
- **Front, cards:** cards que entram na tela com animação, mostrando a contagem regressiva e a porcentagem.
- **Front, landing:** frases novas na seção "Quem será sua Mentora".

## Fora de escopo

- **Cupom de desconto** (código digitado pelo comprador). A campanha vale para todos, sem código.
- **Desconto diferente por produto**, desconto progressivo ou "leve 3, pague 2". A porcentagem é uma só para tudo o que a campanha cobre (decisão 3).
- **Desconto em valor fixo** (R$ 100 de desconto). Só porcentagem.
- **E-mail anunciando a Black Friday.** O módulo de Comunicação (disparos) já existe e pode ser usado à parte, sem código novo.
- **Mudar o parcelamento** (12x com juros do comprador) ou o acesso de 6 meses.
- **Reprecificar pedido já criado.** O pedido vale pelo preço do instante em que foi criado (decisão 6).
- **Mais de uma campanha ao mesmo tempo.** No máximo uma vigente (decisão 2).

## Decisões técnicas desta spec

1. **Campanha é uma tabela, e não uma chave liga/desliga.**
   Modelo novo `Promotion`:
   - `id`, `name` (ex.: "Black Friday"), `percentOff` (inteiro, **1 a 90**), `startsAt`, `endsAt` (`DateTime`, gravados em UTC), `createdById`, `endedEarlyAt` (nulo; preenchido quando o admin encerra antes da hora), `createdAt`, `updatedAt`.
   - **Não existe coluna "ativa".** A campanha vigente é a que tem `startsAt <= agora < endsAt` e `endedEarlyAt` nulo. Pelo mesmo motivo do lote (Spec 019, decisão 3): derivada, ela começa e acaba no instante certo, sem cron e sem ninguém virar a chave.
   - Tabela, e não uma linha só como o `PaymentTestSettings`, porque o pedido aponta para a campanha em que entrou (decisão 5), e a campanha precisa continuar existindo depois de acabar.

2. **No máximo uma campanha vigente, e sem sobreposição.**
   Criar ou editar uma campanha cujo intervalo cruza o de outra (não encerrada) responde 409 "Já existe uma campanha nesse período.". Assim a pergunta "qual o desconto agora?" tem uma resposta só.
   - **Editar campanha que já começou:** pode mudar o `endsAt` (prorrogar ou antecipar) e o `name`. **Não** pode mudar o `percentOff` nem o `startsAt`: pedidos já entraram com aquela porcentagem, e o painel mostraria uma campanha que não foi a que vendeu. Para mudar a porcentagem, encerra-se e cria-se outra.
   - **Campanha que já acabou** não é editável nem apagável. **Campanha futura** pode ser editada por inteiro e apagada.
   - **Encerrar agora:** grava `endedEarlyAt = agora`. Os cards e o preço riscado somem na próxima leitura da oferta.

3. **O que a campanha cobre: o pacote e os módulos avulsos.**
   A mesma porcentagem vale para os dois. O pagamento de teste (Spec 030) fica de fora.
   - **Confirmado pelo usuário em 15/11/2026:** o desconto vale para **todos** os produtos da loja. Sem campo `appliesTo`.

4. **O desconto é calculado no servidor, num ponto só.**
   Uma função pura `applyDiscount(priceCents, percentOff)` = `Math.round(priceCents * (100 - percentOff) / 100)`.
   - **Pacote:** o `amountCents` do pedido é `applyDiscount(tier.priceCents, p)`, e o rateio nos itens (`allocateByWeight`) é feito sobre o valor com desconto. A soma dos itens continua batendo com o `amountCents`.
   - **Avulsos:** cada `OrderItem.priceCents` é `applyDiscount(module.priceCents, p)`, e o `amountCents` é a soma deles. O arredondamento é por item, para o item ser sempre o que o aluno vê ao lado do módulo.
   - Exemplo: R$ 989,00 com 30% → **R$ 692,30**.
   - A oferta pública (`GET /store/offer` e o catálogo) devolve, para cada preço, `priceCents` (com desconto) e `listPriceCents` (o cheio). O front nunca calcula desconto: só exibe.

5. **O pedido guarda o desconto que recebeu.**
   Colunas novas em `Order`, nulas fora de campanha:
   - `promotionId` (FK `Restrict`: campanha que vendeu não é apagável);
   - `promotionNameSnapshot` e `discountPercentSnapshot`, pelo mesmo motivo do `tierNameSnapshot`: o recibo diz "Black Friday −30%" mesmo se a campanha for renomeada;
   - `listAmountCents`: o valor cheio do pedido. O desconto concedido é `listAmountCents - amountCents`.
   - `OrderItem.priceCents` continua sendo o **cobrado**. Estorno, acesso, financeiro e NFS-e não mudam.

6. **O preço vale no instante em que o pedido é criado.**
   - **PIX gerado às 23h50 do último dia** é honrado com desconto até vencer (30 minutos, `SEAT_HOLD_MS`), mesmo pago às 00h10. O QR já tem o valor.
   - **Cartão recusado e tentado de novo depois do fim:** o novo pedido sai com o preço cheio.
   - **Proteção contra surpresa no checkout:** o `POST /orders` passa a aceitar `expectedAmountCents`, o valor que a tela de pagamento mostrou. Se o valor calculado pelo servidor for diferente (a campanha acabou ou começou entre a tela e o clique), a API responde **409** "O preço mudou. Confira o novo valor antes de pagar." e **não** chama o Mercado Pago. O front recarrega a oferta e mostra o novo valor. O servidor continua sendo a fonte do preço: o campo só serve para recusar, nunca para definir o valor.

7. **Fuso horário: tudo em `America/Sao_Paulo` na tela, UTC no banco.**
   - O painel envia data e hora locais de Brasília, e a API grava em UTC.
   - O texto "Oferta válida até 27/11 às 23h59" é formatado em `America/Sao_Paulo`, mesmo para quem acessa de outro fuso.
   - **Relógio do navegador:** a oferta pública devolve `serverNow` junto com `endsAt`. A contagem regressiva usa a diferença entre os dois, e não o relógio do aparelho, que pode estar errado. Quando a contagem chega a zero, o front recarrega a oferta: quem decide que acabou é o servidor.

8. **Preço riscado: o "de" é o preço real praticado.**
   O Código de Defesa do Consumidor e o Procon tratam como propaganda enganosa o "de R$ X" que nunca foi cobrado ("Black Fraude"). Por isso o preço riscado é **sempre** o `listPriceCents` que vem do banco, e nunca um número digitado no painel.
   - **Pacote em campanha:** a âncora "Valor dos módulos separadamente" **sai** enquanto a campanha vale. Fica só "~~R$ 989,00~~ **R$ 692,30** · −30%", para não haver dois preços riscados competindo.
   - **Módulo avulso em campanha:** "~~R$ 247,00~~ **R$ 172,90**".
   - Acessibilidade: o `<s>` vem com texto para leitor de tela ("Preço anterior: R$ 989,00. Preço com desconto: R$ 692,30."), porque o risco é só visual.

9. **Cards que pulam na tela.**
   Componente `ui-promo-card`, em `shared/ui/`, com dois usos:
   - **Card flutuante** (landing, `/planos`, `/loja`): entra pelo canto inferior com animação de salto ("bounce in") alguns segundos depois de a página abrir. Mostra o nome da campanha, a porcentagem em destaque ("−30%"), a contagem regressiva (dias, horas, minutos, segundos) e um botão "Ver oferta" para a loja. Tem botão de fechar.
   - **Card em linha:** dentro da seção de preço do `/planos` e no topo da loja, com a mesma contagem, sem ser fechável.
   - **Regras:**
     - Fechado, o card flutuante não volta na mesma sessão (`sessionStorage`, com try/catch: sem storage, ele só volta a aparecer).
     - **Não cobre CTA nem o resumo do pedido:** não aparece na tela de pagamento nem no `/loja/pedido`.
     - **SSR:** o card e o relógio só rodam no navegador (`afterNextRender`/`isPlatformBrowser`). No servidor sai só o card em linha, com a data de término e sem contagem, para não quebrar a hidratação.
     - **`prefers-reduced-motion`:** sem salto; o card aparece com um fade simples.
     - **Leitor de tela:** a contagem não é anunciada a cada segundo (sem `aria-live` no relógio). O card tem um texto estático, "Oferta de Black Friday: 30% de desconto até 27/11 às 23h59".
     - O relógio é um signal atualizado por um `setInterval` de 1 s, limpo no `DestroyRef`. Faltando menos de 1 hora, o card muda de cor para reforçar a urgência.
   - O visual segue a identidade da landing (glass card, gradiente da marca). O desenho fino fica para a Fase 4, com a skill `frontend-design`.

10. **Financeiro: o painel da campanha.**
    Card novo "Campanha de desconto" no `admin-financeiro`, abaixo do "Pagamento de teste":
    - **Sem campanha:** botão "Criar campanha".
    - **Formulário (Reactive Forms):** nome (padrão "Black Friday"), porcentagem (1 a 90, inteiro), início e fim (data e hora de Brasília). O fim tem de ser depois do início, e o início não pode estar no passado na criação. Uma prévia mostra "O pacote sai de R$ 989,00 por R$ 692,30" com o preço vigente, calculada pela API (`GET /admin/promotions/preview?percentOff=30`), para não haver uma segunda conta no front.
    - **Campanha agendada:** "Começa em 27/11 às 00h00", com editar e apagar.
    - **Campanha vigente:** selo "No ar", contagem até o fim, pedidos pagos na campanha e desconto concedido até agora, botões "Prorrogar/alterar fim" e "Encerrar agora" (com confirmação no próprio card, sem `confirm()` do navegador).
    - **Histórico:** campanhas encerradas, com período, porcentagem, pedidos pagos, receita e desconto concedido.
    - **Relatório do período:** linha "Descontos concedidos" no resumo, e um selo "Black Friday −30%" nos pedidos da campanha na lista.

11. **NFS-e: a nota sai pelo valor cobrado.**
    O `nfse-builder` já usa o valor do pedido, que passa a vir com desconto. A nota sai com o **valor efetivamente cobrado**, sem campo de desconto.
    - **Confirmado em 15/11/2026:** a nota sai com o **valor cobrado**, sem "desconto incondicional". O `nfse-builder` não muda. A emissão continua só em produção (Spec 031).

12. **Recibo, pedido e e-mail.**
    A tela do pedido (`/loja/pedido`) e o e-mail "Compra confirmada" mostram "~~R$ 989,00~~ R$ 692,30 · Black Friday −30%" quando o pedido tem `promotionId`. Pedido sem campanha não muda.

## Textos da mentora

A seção `#mentora` da landing (`front/src/app/features/landing/landing.html`, linhas 83–120) hoje tem o overline "Quem será sua Mentora", o título "Lidiane Delcastanher", dois parágrafos e os 4 números (`stats`, em `landing.ts`).

**Fonte:** o usuário mandou o print `libs/WhatsApp Image 2026-11-15 at 11.03.24.jpeg` (15/11/2026), com a seção vista no celular. O texto abaixo foi transcrito dele. O overline, o título e a foto continuam como estão.

### Parágrafos (substituem os dois de hoje)

Os trechos em **negrito** são os que aparecem em negrito no print (`<strong class="text-brand-navy">`, como hoje). O nome do livro vai em itálico.

1. Com **mais de 20 anos de experiência**, atua de forma multissetorial nos segmentos de Indústria, Tecnologia e Setor Público, com foco na estruturação e reestruturação de Recursos Humanos, desenvolvimento de lideranças, gestão estratégica de pessoas e consolidação de culturas de alta performance.
2. Administradora, com MBA em Gestão de Pessoas e Pós-Graduação em Performance Organizacional, é CEO da **Delcastanher Serviços Administrativos e Treinamentos**. Possui trajetória marcada pela participação em diversas **imersões, programas e experiências de desenvolvimento em Liderança e Recursos Humanos**.
3. É coautora do livro *"Trajetória e Cotidiano dos Líderes do Brasil"* e também integra uma publicação em formato de revista, ampliando sua contribuição para o compartilhamento de conhecimento, experiências e reflexões sobre gestão e liderança.
4. Sua atuação conecta estratégia, pessoas e resultados, transformando conhecimento em práticas que impulsionam organizações e desenvolvem profissionais.

### Cards (substituem os 4 `stats` de hoje)

| Hoje | Novo: destaque | Novo: legenda |
|---|---|---|
| +20 · Anos de Exp. | **+20** | Anos de experiência |
| +50 · Empresas | **Mentora e Instrutora** | (sem legenda) |
| 03 · Setores | **01** | Livro como coautora |
| 01 · Livro Publicado | **RH & Liderança** | Imersões e desenvolvimento |

- Ordem do print, em grade 2×2 no celular: +20, Mentora e Instrutora / 01, RH & Liderança.
- **Dois cards têm texto no destaque, e não número.** O `text-3xl` de hoje quebra "Mentora e Instrutora" mal num card estreito. O item de `stats` ganha `kind: 'number' | 'text'`: número fica como hoje; texto usa fonte menor (no print, ~`text-xl`, caixa alta, `text-brand-navy`, sem o gradiente). A `label` passa a ser opcional.
- No desktop, a grade de 4 colunas (`md:grid-cols-4`) fica estreita para "Mentora e Instrutora". Passa a ser 2×2 também no desktop (`grid-cols-2`), ao lado da foto. Conferir no navegador na Task 5.1.
- "+50 Empresas" e "03 Setores" saem da página.

## Critérios de aceite

- O admin cria no Financeiro a campanha "Black Friday", 30%, de 27/11 00h00 a 30/11 23h59 (Brasília). Antes do início, a loja mostra o preço normal e nenhum card.
- No início, sem deploy, a loja mostra "~~R$ 989,00~~ R$ 692,30 · −30%" e "Oferta válida até 30/11 às 23h59". Os módulos avulsos também mostram o preço riscado e o novo (decisão 3).
- O card flutuante entra com animação na landing, no `/planos` e na loja, com a contagem regressiva certa mesmo com o relógio do aparelho adiantado. Fechado, não volta na sessão. Com movimento reduzido, entra sem salto.
- O pedido do pacote na campanha é cobrado R$ 692,30, com `promotionId`, `discountPercentSnapshot = 30` e `listAmountCents = 98900`. A soma dos itens é R$ 692,30.
- Um pedido com `expectedAmountCents` diferente do calculado responde 409 e não chega ao Mercado Pago.
- Um PIX gerado na campanha e pago depois do fim é aprovado com o valor do QR.
- No fim, ou ao clicar em "Encerrar agora", o preço volta a R$ 989,00 e os cards somem, sem deploy.
- Não é possível criar duas campanhas com períodos que se cruzam, nem mudar a porcentagem de uma campanha que já começou.
- O Financeiro mostra os pedidos da campanha com o selo e o total de descontos concedidos no período.
- A NFS-e de um pedido da campanha sai com o valor cobrado.
- A seção "Quem será sua Mentora" mostra os 4 parágrafos e os 4 cards do print, com os negritos, e nenhum card quebra o texto mal no celular (360 px) nem no desktop.
- `npm test` e `npm run build` da API, `ng test` e `ng build` do front passam.
