# Tasks: Spec 018 - Na Mídia (Prova de Autoridade e Hero da Landing)

Spec só de front (Angular standalone + signals + Tailwind). Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas abaixo estão no `context.md`.

Ordem das fases: primeiro as imagens que já existem na landing, com o hero novo junto, porque a foto do hero muda de papel na mesma task em que ganha `NgOptimizedImage`. Depois os assets de mídia, o card e a seção, nessa ordem, para que o componente seja escrito contra arquivos e dados reais. O JSON-LD vem depois da seção porque lê a mesma lista `media`. A verificação no navegador fecha a spec.

## Fase 1: Imagens Existentes e Hero
- [ ] **Task 1.1:** Trocar por `ngSrc`, com `width`/`height` intrínsecos, a foto da Mentora (`nova_mentora.jpeg`, 1130×1392) e as duas da metodologia (`aula2.jpeg` e `aula1.jpeg`, 1280×852), mantendo as classes de tamanho e `object-cover` e o carregamento lazy padrão (decisão 9).
- [ ] **Task 1.2:** Adicionar ao `styles.scss` a classe `.hero-fade`, que aplica `mask-image` e `-webkit-mask-image` sobre a camada de gradiente (decisão 11):
  - abaixo de `md`: máscara vertical, transparente até `calc(var(--hero-photo-h) - 6rem)` e opaca a partir de `var(--hero-photo-h)`;
  - a partir de `md`: máscara horizontal, opaca até ~45% e transparente a partir de ~65%.
- [ ] **Task 1.3:** Reestruturar o hero em três camadas — foto (`z-0`), `bg-gradient-hero` com `.hero-fade` (`z-10`), texto e CTAs (`z-20`) — e declarar `--hero-photo-h` (~`26rem`) no `<header>` (decisão 11).
- [ ] **Task 1.4:** Trocar a foto do hero por `<img ngSrc="assets/aula1.jpeg" fill priority>`, com `object-cover`, ponto focal em torno de `70% 30%` e o `alt` atual. No mobile, a foto é um bloco no topo, com a largura toda e altura `var(--hero-photo-h)`. A partir de `md`, fica `absolute inset-y-0 right-0` com ~65% da largura. Remover o `hidden md:block` (decisões 9 e 11).
- [ ] **Task 1.5:** Alinhar o texto à esquerda com `max-w-xl`, abaixo da foto no mobile e sobre a parte opaca do gradiente no desktop. Remover a coluna da foto flutuante (`animate-float`, `rounded-3xl`, `shadow-glass-lg`) e o blob atrás dela, remover o `blob-navy` do canto inferior direito e aplicar `min-h` de ~600 px a partir de `md` (decisão 11).

## Fase 2: Assets de Mídia
- [ ] **Task 2.1:** Recortar as faixas pretas de 60 px de `hapo-educacao-sddefault.jpg` (640×480 → 640×360).
- [ ] **Task 2.2:** Converter as quatro imagens de `.specs/018 - Na Mídia/libs/` para `.webp` e publicá-las em `front/public/assets/midia/` com os nomes da tabela "Material recebido" (decisão 6). A conversão usa uma ferramenta de linha de comando via `npx`, sem entrar como dependência no `package.json`.
- [ ] **Task 2.3:** Conferir as dimensões intrínsecas reais dos quatro arquivos publicados. São elas que vão para o array, e não as da origem.

## Fase 3: Componente `ui-media-card`
- [ ] **Task 3.1:** Criar `shared/ui/media-card/` (standalone, `OnPush`, `input()`, template inline) e exportar os tipos `MediaAppearance` e `MediaEmbed` (`{ provider: 'youtube' | 'instagram'; id: string }`), com `cover`, `url` e `embed` opcionais (decisões 2 e 5).
- [ ] **Task 3.2:** Montar o card (decisões 2 e 7):
  - selo "Revista" / "Podcast" / "Livro" via `ui-badge`;
  - título em `<h3>`, veículo e data;
  - link de saída ("Ler matéria" / "Assistir no YouTube" / "Assistir no Instagram" / "Ver no Instagram") com `target="_blank"` e `rel="noopener"`;
  - sem `url`, nenhum `<a>`.
- [ ] **Task 3.3:** Montar a célula da mídia: altura fixa, peça em `object-contain` e, atrás dela, a mesma imagem em `object-cover` com `blur`, opacidade reduzida, `alt=""` e `aria-hidden="true"`. Sem `cover`, a célula mostra o nome do veículo escrito (decisões 5 e 6).
- [ ] **Task 3.4:** Implementar a fachada do player (decisão 3):
  - botão de play com `aria-label="Reproduzir episódio: <título>"`;
  - signal `playing`;
  - `computed()` que valida o `id` por provedor e monta o `src` a partir de um template fixo, passando pelo `DomSanitizer`;
  - iframe com `title` e os atributos da tabela da decisão 3;
  - `id` inválido cai para capa + link.
- [ ] **Task 3.5:** Escrever `media-card.spec.ts`:
  - `<h3>`, selo, `alt` e estado pendente sem imagem e sem link;
  - nenhum `<iframe>` antes do clique;
  - `src` correto para YouTube e para Instagram depois do clique;
  - `id` inválido sem botão de play nem iframe.

## Fase 4: Seção "Na mídia" na Landing
- [ ] **Task 4.1:** Criar a lista tipada `media: MediaAppearance[]` no `landing.ts`, ao lado de `partners`, com os quatro itens da tabela "Material recebido" na ordem revista, Hapo, Conexão e livro.
- [ ] **Task 4.2:** Inserir a seção `#midia` entre a citação e o Método, com `ui-section-header` (`<h2>`) e o grid (decisões 1, 7 e 10):
  - uma coluna no mobile, `md:grid-cols-2`, `xl:grid-cols-4`;
  - `AnimateOnScroll` nos cards, como nos pilares.
- [ ] **Task 4.3:** Adicionar `{ label: 'Na mídia', href: '#midia' }` ao `navLinks`, logo depois de "A Mentora" (decisão 1).
- [ ] **Task 4.4:** Atualizar `landing.spec.ts`:
  - seção com `<h2>` e um card por item;
  - `target="_blank"` e `rel` com `noopener` em todos os links externos da seção;
  - item sem `url` sem `<a>`;
  - `#midia` no `navLinks`;
  - imagem do hero sem `hidden`, com `fetchpriority="high"` e `alt`.

## Fase 5: Dados Estruturados
- [ ] **Task 5.1:** Injetar o `JsonLdService` na landing e declarar o `Person` da Lidiane (nome, cargo, organização `Delcastanher`) com `subjectOf` derivado de `media` (decisão 8):
  - revista como `Article`;
  - podcasts como `VideoObject`, com `thumbnailUrl` absoluto em `SITE_ORIGIN` e `uploadDate`;
  - livro e itens sem `url` excluídos;
  - sem `sameAs`.
- [ ] **Task 5.2:** Cobrir no `landing.spec.ts` que o `<head>` recebe o `Person` e que o `subjectOf` tem exatamente os três itens esperados.

## Fase 6: Fechamento
- [ ] **Task 6.1:** Rodar `ng build` e `ng test` no `front/` e corrigir regressões. Conferir no HTML prerenderizado da landing:
  - o preload da foto do hero;
  - o bloco JSON-LD;
  - nenhum `<iframe>`.
- [ ] **Task 6.2:** Subir em `localhost:4200` e validar no Chrome, em mobile, tablet e desktop:
  - **hero:** a foto no topo e o gradiente sumindo antes do rosto no mobile; a foto à direita e o gradiente horizontal no desktop;
  - **grid:** 1 → 2×2 → 4 colunas;
  - **player do YouTube:** abre na célula;
  - **player do Instagram:** o reel fica inteiro visível; se não ficar, ajustar a altura da célula depois do clique (decisão 3);
  - **navegação:** a âncora `#midia` no menu leva à seção;
  - **links:** abrem em nova aba;
  - **console:** nenhum aviso `NG0295x`.
- [ ] **Task 6.3:** Rodar o Lighthouse da landing antes e depois da spec e registrar o LCP no PR.
