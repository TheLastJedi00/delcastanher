# Spec 025: Melhorias Pós-Lançamento

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Specs 013, 014, 016, 019 e 023, e a triagem feita com a Spec 024.

## Objetivo
Reunir o que **pode ser resolvido depois do lançamento sem afetar a cliente nem os alunos**. Nada aqui bloqueia a entrega: o que bloqueia está na Spec 024.

Nenhum item tem prazo. O único que tinha, a tela de acesso expirado (E1), já está no ar desde a Spec 014 (revisão de 07/10/2026, abaixo).

Um item **não pode esperar o lançamento**: o logo do Mercado Pago (E8) aparece quebrado no checkout de produção hoje.

## Itens e por que podem esperar

| # | Item | Origem | Por que pode esperar |
|---|---|---|---|
| E1 | Tela de "acesso expirado" quando o 403 chega com a aba aberta, com volta à loja e o módulo já marcado | Spec 014, task 8.3 | **Já implementada** (commit `9680aa4`, Spec 014, decisão 17). Sobra conferir ao vivo |
| E2 | Segmento "concluíram o curso" contando quem só tem diploma de módulo | Spec 023, B2 (Bugs) | Campanha de marketing não é necessária para lançar |
| E3 | Teste de campanha no Gmail e no Outlook, com o "Cancelar inscrição" nativo | Spec 023, task 6.8 | Idem |
| E4 | E-mail de PIX expirado, com o caminho para gerar outro (era "lembrete de PIX pendente") | Spec 024, D6 | O QR e a contagem regressiva já aparecem na tela |
| E5 | `.pptx` com o rótulo "DOC": tipo `ppt` na API, no front e no ícone | Bugs | Cosmético |
| E6 | `h1` em cada aba do `/admin` | Specs 013 e 016 | Só o painel da cliente; a navegação não quebra |
| E7 | Acessibilidade fina da loja, do checkout e do `/planos`: foco entre etapas, `aria-live` no PIX, navegação por teclado na escolha pacote/avulsos | Spec 014, task 9.3; Spec 019, task 7.10 | A marcação básica (rótulos, `fieldset`, `role="alert"`) já existe. O que quebrar no celular é corrigido na Spec 024 |
| E8 | Logo do Mercado Pago e selos de segurança no pagamento, mais os itens **recomendados** da avaliação de qualidade | Spec 014, tasks 9.7 e 7.8 | Os selos já existem (`ui-payment-trust`). **O logo não pode esperar:** o arquivo nunca foi adicionado e aparece quebrado no checkout. Os itens recomendados da avaliação podem esperar; os **obrigatórios** sobem para a Spec 024 se a avaliação os apontar |
| E9 | Vídeo de apresentação na landing (YouTube) | Spec 023, tasks 7.1 e 7.6 | A seção fica escondida enquanto o id está vazio |
| E10 | Confirmações ao vivo já cobertas por testes automáticos: 403 do financeiro com papel aluno, virada de lote pelo painel, fluxo de acesso parcial e teste de ponta a ponta do painel admin | Spec 016, task 7.8; Spec 019, tasks 7.2, 7.4 e 7.7; Spec 013, task 6.5 | Cobertas por `*.http.spec` e `bundles.service.spec`; aqui é só confirmação em ambiente real |
| E11 | Melhorias de velocidade não críticas da auditoria de 2026-10-05: imagens da landing em tamanhos responsivos e formato moderno (cerca de 214 KiB a menos); imagens fora da tela da página do curso carregando sob demanda (cerca de 78 KiB); cerca de 30 KiB de JavaScript não usado por página | Spec 024, task 5.3 | Performance entre 94 e 97 e LCP de 2,2 a 2,7 s no celular: nada crítico |
| E12 | Remover a tela "Artigos" do Ambiente do Aluno (`/ava/artigos`) | Pedido do usuário em 06/10/2026 | Não é mais requisito do projeto. Hoje ela só mostra dois artigos fixos no código, sem link para lugar nenhum e sem como o admin cadastrar outros |

## Decisões a tomar quando a spec começar
- **E2:** filtrar `moduleId: null` no segmento (só diploma do curso) ou renomear para "Alunos com algum certificado". **Recomendado:** o filtro, porque o rótulo "concluíram o curso" é o que a cliente espera ao escolher o público.
- **E4:** se o e-mail de PIX expirado leva um link para a loja com os mesmos módulos já marcados, ou só para o `/planos`.

## Revisão de 07/10/2026
Feita contra o código da `main` (`ed5346b`).

### E1: a tela já existe
O commit `9680aa4` (17/09/2026), da Spec 014, decisão 17, criou o estado `accessDenied` em `features/student/trilha/`:
- o 403 do vídeo (`playback`) e o dos materiais da aula (`materialsOf`) viram o aviso "Seu acesso a este módulo não está ativo", e não a faixa vermelha de erro;
- o botão "Ver na loja" chama `buyActiveModule()`, que abre a loja com o módulo marcado (`?modulo=<ordem>`, Spec 019, decisão 11).

O texto não diz "expirou" de propósito: o mesmo aviso cobre quem nunca comprou o módulo. Por isso o prazo de 6 meses deixou de existir, e o E1 vira só uma conferência ao vivo, com uma conta cujo acesso foi vencido no banco.

### E4: o lembrete não cabe na infraestrutura
O PIX vence em **30 minutos** (`PIX_EXPIRATION = 'PT30M'`, `payments.types.ts`). Um lembrete "20 minutos antes de expirar" teria de sair 10 minutos depois da compra. Os únicos agendamentos da API são os crons da Vercel (`api/vercel.json`), que rodam **uma vez por dia**. Nada dispara no minuto certo, e com 30 minutos de validade o comprador ainda está, quase sempre, com a tela do QR aberta.

**Novo desenho:** um e-mail na transição do pedido para `EXPIRED`, dizendo que o PIX venceu e levando de volta à compra. É o mesmo padrão do e-mail de confirmação (Spec 024, Tasks 3.2 e 3.3):
- quem dispara é a própria transição no `OrdersService` (webhook do Mercado Pago ou leitura do pedido pela tela), sem cron;
- um envio por pedido, gravado numa coluna nova `Order.expiredEmailedAt DateTime?` (migration só de adição);
- falha do Resend não muda o pedido nem a resposta do webhook;
- transacional (sem `List-Unsubscribe`), e só para PIX: cartão recusado não expira.

### E8: o logo do Mercado Pago nunca foi adicionado
O `ui-payment-trust` (`shared/ui/payment-trust/payment-trust.ts`), usado no `pagamento.ts`, aponta para `assets/mercado-pago.svg`. **Esse arquivo não existe** em `front/public/assets/`, e nunca existiu no histórico. No checkout de produção aparece a imagem quebrada com o texto "Mercado Pago". Os selos de segurança estão certos.

A correção é adicionar o SVG oficial do Mercado Pago, como a marca publica, sem redesenhar. Ela sai antes do lançamento, porque é o item da avaliação de qualidade que o comprador vê.

### Onde cada item toca
| # | Camada | Arquivos |
|---|---|---|
| E1 | Front | `features/student/trilha/trilha.ts` e `trilha.html` (só conferência) |
| E2 | API | `campaigns/segments.ts` (caso `COMPLETED`) e `segments.spec.ts` |
| E3 | Nenhuma | Teste manual com uma campanha real |
| E4 | API e banco | `payments/orders.service.ts`, `mail/` (template novo), migration `expiredEmailedAt` |
| E5 | API e front | API: `content/content.types.ts` (`MaterialKind` e `KIND_BY_TYPE`). Front: `content.service.ts`, `admin-content.service.ts` e `shared/ui/material-item/`. O banco guarda o MIME (`Material.fileType`) e o tipo é calculado na leitura, então **não há migration** |
| E6 | Front | Abas `aulas`, `comunicacao`, `dashboard`, `financeiro` e `perfil` do `/admin`. A `politicas` já tem `level="h1"` |
| E7 | Front | `features/loja/` (loja e `pagamento.ts`) e `features/plans/` |
| E8 | Front | `public/assets/mercado-pago.svg` (novo) |
| E9 | Front | `features/landing/landing.ts` (`PRESENTATION`) |
| E10 | Nenhuma | Conferência ao vivo |
| E11 | Front | Imagens da landing e da página do curso, e o bundle |
| E12 | Front | Lista na seção abaixo |

## E12: remoção da tela "Artigos"
A tela nasceu no MVP (Spec 001, `fix.md`) como "seção estilo blog para leituras complementares", e o card ganhou componente na Spec 002, mas nunca ganhou cadastro no `/admin` nem API. É um componente com dois artigos fixos (`artigos.ts`) e cards que não abrem nada. A cliente não vai publicar artigos, então ela deixa de ser requisito e sai do produto, em vez de ganhar um CRUD que ninguém vai usar.

Tudo é só do front. A API e o banco não têm nada de artigos.

- **Removido:**
  - a rota `/ava/artigos` (`app.routes.ts`);
  - o componente `features/student/artigos/`;
  - o `ui-article-card` (`shared/ui/article-card/`), que só essa tela usa;
  - o item "Artigos" da sidebar do aluno (`layout.ts`) e o ícone `article` do `ui-sidebar-link`, que fica sem uso;
  - o card "Artigos" do hub (`hub.ts`);
  - a imagem `public/assets/aula3.jpeg`, que só os artigos usam. A `aula2.jpeg` fica, porque a landing a usa.
- **Redirecionamento:** `/ava/artigos` passa a redirecionar para `/ava`. É uma linha, e quem tiver o link salvo cai no hub em vez da página de não encontrado.
- **Ajustado:**
  - o teste `layout.spec.ts`, "leva a loja pela sidebar, depois de Artigos", passa a conferir a loja depois de **Materiais**;
  - o comentário de `layout-route.ts` deixa de citar os artigos.
- **Fica:** o tipo `'article'` do `SeoService`. Ele é o `og:type` das páginas públicas (`seo-route.ts`) e não tem relação com esta tela.
