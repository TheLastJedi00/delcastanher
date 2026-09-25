# Spec 018: Na Mídia — Prova de Autoridade na Landing

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 002 (Design System), Spec 009 (SEO, Analytics e Conformidade) e Spec 011 (Ajustes Simples)
**Escopo técnico:** somente `front/` (Angular standalone + signals + Tailwind). Nenhuma rota, model ou serviço do `api/` é tocado, então não há suíte de backend nesta spec.

## Objetivo
Reforçar a autoridade da Lidiane na landing com as aparições em podcasts, a capa da revista Prospere e a coautoria da 2ª edição do livro "Trajetória e Cotidiano dos Líderes do Brasil", em cards de preview. A mesma passagem fecha as pendências já mapeadas na página, principalmente as quatro imagens que ainda não usam `NgOptimizedImage` — e esta é a página que recebe o tráfego das campanhas de Ads.

## Escopo

- **Seção "Na mídia" (`#midia`):** grid de cards com a capa da Prospere, um card por podcast e o livro. Cada card tem capa, selo de tipo, título, veículo/data e link externo.
- **Dados tipados:** lista `media` no `landing.ts`, ao lado de `partners` e `pillars`; nada escrito no template.
- **Navegação:** entrada "Na mídia" no `navLinks`.
- **Dados estruturados:** schema `Person` da Lidiane na landing, com as aparições em `subjectOf`.
- **Hero:** a foto da Lidiane deixa de ser um card flutuante na metade direita e vira imagem de fundo alinhada à direita. O texto fica à esquerda, sobre o gradiente da marca, que invade levemente a foto e se dissolve logo em seguida (decisão 11).
- **Imagens da landing:** as quatro `<img>` cruas (hero, mentora e as duas da metodologia) passam a `NgOptimizedImage`.
- **Testes:** `landing.spec.ts` e o spec do componente novo.

## Material recebido

As imagens de origem ficam em `.specs/018 - Na Mídia/libs/`.

| Campo | Revista Prospere | Podcast Hapo Educação | Podcast Conexão Contabilidade | Livro Líderes do Brasil |
|---|---|---|---|---|
| Selo | Revista | Podcast | Podcast | Livro |
| Título do card (`<h3>`) | Da administração à liderança: uma trajetória construída para transformar pessoas | Aprenda a formar lideranças de alta performance | Episódio 2: Contratação e retenção de talentos | Coautora da 2ª edição de "Trajetória e Cotidiano dos Líderes do Brasil" |
| Veículo | Revista Prospere — Legado | Hapo Educação (YouTube) | Conexão Contabilidade (corte no Instagram) | Academia de Líderes do Brasil |
| Edição / data | nº 90 · agosto de 2026 | 11 de outubro de 2025 | 3 de julho de 2025 | 2ª edição · lançamento em São Paulo · post de 27 de julho de 2025 |
| Link | https://prosperebrasil.com.br/lidiane-delcastanher/ | https://www.youtube.com/watch?v=Qvm2UtJkxA0 | https://www.instagram.com/conexaocont/reel/DLpl5hNO-XS/ | https://www.instagram.com/lidianedelcastanher/p/DMnzilyyXP3/ |
| Player embutido | — | `{ provider: 'youtube', id: 'Qvm2UtJkxA0' }` | `{ provider: 'instagram', id: 'DLpl5hNO-XS' }` | — |
| Arquivo de origem | `legado-lidiane-delcastanher.webp` (1080×1350, 4:5) | `hapo-educacao-sddefault.jpg` (640×480, com faixas pretas) | `conexao-contabilidade-ep2-reel.jpg` (360×640, 9:16) | `Trajetória do cotidiano dos líderes do Brasil.png` (436×599, PNG com fundo branco) |
| Arquivo publicado | `assets/midia/prospere-90-capa.webp` (1080×1350) | `assets/midia/hapo-educacao-episodio.webp` (640×360) | `assets/midia/conexao-contabilidade-ep2.webp` (360×640) | `assets/midia/livro-lideres-do-brasil-2a-edicao.webp` (436×599) |
| `alt` | Capa da revista Prospere nº 90, agosto de 2026, com Lidiane Delcastanher | Lidiane Delcastanher em entrevista ao podcast da Hapo Educação | Lidiane Delcastanher no episódio 2 do podcast Conexão Contabilidade, sobre contratação e retenção de talentos | Lidiane Delcastanher segurando a 2ª edição do livro Trajetória e Cotidiano dos Líderes do Brasil |

- **Revista:** o título do card é a chamada da capa. O título da página da matéria é só "Lidiane Delcastanher", que repetiria o nome que a landing já exibe várias vezes. "Legado" é a série de capas da revista e aparece junto ao veículo.
- **Podcast:** título, canal e data vêm dos metadados do vídeo no YouTube. O título original, todo em maiúsculas, vai para a caixa de frase. A capa é a miniatura oficial do episódio: o YouTube não gera `maxresdefault` para esse vídeo, então a origem é o `sddefault` (640×480). Ele tem faixas pretas de 60 px em cima e embaixo, que são recortadas na execução, e o arquivo publicado fica com 640×360 (16:9).
- **Conexão Contabilidade:** o material é um corte do episódio 2 publicado como reel no perfil `@conexaocont`, e não o episódio inteiro. O título vem da arte da capa ("Episódio 2 — Contratação e Retenção de Talentos"). A página pública do reel não expõe legenda nem data, então a data foi derivada do ID da mídia (`3668630051856573906`), cujos primeiros bits são o timestamp de publicação. A capa é a imagem de preview do reel (`og:image`), baixada e hospedada no próprio site porque a URL da CDN do Instagram expira (`oe=`). Ela tem 360×640 e já traz um ícone de play no centro; o botão da fachada (decisão 3) fica centralizado exatamente sobre ele. A resolução é baixa para telas 2x; se existir a capa original do episódio ou o link do episódio completo, eles substituem esta linha.
- **Livro:** a Lidiane é coautora da 2ª edição de "Trajetória e Cotidiano dos Líderes do Brasil", da Academia de Líderes do Brasil (nome na própria capa), lançada em São Paulo. A foto dela segurando o livro é a imagem do card. O link é o post do lançamento no perfil dela, e a data da tabela é a do post, derivada do ID da mídia (`3686141497440826359`) como no reel da Conexão; a data do evento de lançamento não foi informada e não aparece no card. É um post de foto, então não há player: o card é preview + "Ver no Instagram". A foto tem 436×599, também baixa para telas 2x; uma versão maior substitui esta.

Uma aparição que chegar depois sem capa ou sem link segue a decisão 5.

## Decisões técnicas desta spec

1. **A seção entra logo depois da citação, antes do Método.**
   A ordem fica Mentora → citação → Na mídia → Método. Entre a Mentora e a citação, a seção quebraria um bloco que hoje é contínuo: a citação é assinada pela própria Lidiane e fecha a apresentação dela. Depois da citação, a mídia é a prova de terceiros que sustenta o que a página acabou de afirmar, e só então vem o Método. No `navLinks`, "Na mídia" entra logo depois de "A Mentora".

2. **Card novo `ui-media-card`, e não o `ui-article-card`.**
   O pedido era reaproveitar o `ui-article-card` e só criar um card novo se faltasse algo. Falta mais de uma coisa:
   - o selo é fixo em `'Leitura: ' + readTime()`, e a seção precisa de "Revista" / "Podcast" / "Livro";
   - o título é um `<span>`, e aqui precisa ser `<h3>` (decisão 7);
   - o link não tem `target="_blank"` nem `rel`;
   - a imagem é `<img>` cru, sem `NgOptimizedImage` nem dimensões;
   - o layout é horizontal e foi pensado para miniatura em paisagem, enquanto aqui chegam retratos (4:5, 9:16 e a foto do livro, ~3:4) e uma paisagem (16:9);
   - não existe estado de pendente (sem imagem e sem link);
   - o card inteiro é um `<a>`, e o player da decisão 3 precisa de um `<button>` e de um `<iframe>`, que não podem ficar dentro de um link.

   Evoluir o `ui-article-card` para cobrir tudo isso levaria ao `/ava/artigos` opções que ele não usa e mudaria a semântica do card de lá. O `ui-media-card` entra em `shared/ui/media-card/` no padrão da casa (standalone, `OnPush`, `input()`, template inline) e usa o `ui-badge` para o selo. O `ui-article-card` não é tocado.

3. **Os podcasts tocam na própria página, com o iframe carregado só no clique (fachada).**
   Os dois cards de podcast têm player embutido: YouTube no da Hapo e Instagram no da Conexão Contabilidade. Colocar o `<iframe>` direto no HTML traria três problemas: carregaria os scripts da plataforma em toda visita (cerca de 1 MB no YouTube), pesando no LCP da página de Ads; gravaria cookies e `localStorage` de terceiros antes de qualquer resposta ao banner da Spec 009; e sairia no HTML prerenderizado. Por isso o player segue o padrão de fachada:
   - **Antes do clique:** o card mostra a capa local (`NgOptimizedImage`) com um botão de play por cima (`<button>`, com `aria-label="Reproduzir episódio: <título>"`). Nenhuma requisição vai ao YouTube nem ao Instagram.
   - **No clique:** um `signal` `playing` troca a capa pelo `<iframe>` da plataforma, na mesma célula, com `title` descritivo e `referrerpolicy="strict-origin-when-cross-origin"`.

     | Provedor | `src` do iframe | Observação |
     |---|---|---|
     | `youtube` | `https://www.youtube-nocookie.com/embed/<id>?autoplay=1` | `allow="autoplay; encrypted-media; picture-in-picture"`, `allowfullscreen`. O domínio `-nocookie` não grava cookie de rastreamento até a reprodução. |
     | `instagram` | `https://www.instagram.com/reel/<id>/embed/` | Iframe direto, sem o `embed.js` do Instagram, que varre a página e injeta scripts. O embed não aceita autoplay, então o visitante dá um segundo play dentro do player. |

     A reprodução é pedida pelo próprio visitante: vale como ação explícita, e não como carga silenciosa, independentemente da resposta ao banner.
   - **Link de saída mantido:** abaixo do player, "Assistir no YouTube" / "Assistir no Instagram", com `target="_blank"` e `rel="noopener"`, para quem prefere o app ou está com o iframe bloqueado por extensão.
   - **Prerender:** o `<iframe>` só existe depois de um clique, então nunca aparece no HTML do build, e nada usa `window`.
   - **Segurança:** o item declara `embed: { provider: 'youtube' | 'instagram'; id: string }`. O `src` é montado pelo card a partir de um template fixo por provedor, com o `id` validado (`^[\w-]{11}$` no YouTube, `^[\w-]{5,40}$` no Instagram), e passa pelo `DomSanitizer` num `computed()`. Nenhuma URL arbitrária vira `ResourceUrl`, e um `id` fora do formato faz o card cair para capa + link, sem iframe.
   - **Proporção do player:** o iframe do YouTube é 16:9. O embed do Instagram é vertical e acrescenta cabeçalho e rodapé do próprio Instagram, sem altura previsível. O player ocupa a célula inteira (decisão 6); na execução, conferir no Chrome, em mobile e desktop, se o reel fica inteiro visível. Se não ficar, a célula do card com `instagram` ganha altura própria depois do clique, e não o card inteiro.
   - **Sem biblioteca:** a fachada é um `@if` com um `signal`. Pacotes como `lite-youtube-embed` resolvem o mesmo com Web Component e CSS próprios, e seriam a primeira dependência de UI do projeto (Spec 011, decisão 4).

   A revista continua como preview com link para a matéria: não há o que embutir. No `ui-media-card`, o link fica no título e no "Assistir/Ler", e a célula da mídia é independente (decisão 2).

4. **Os stats da Mentora continuam com quatro colunas.**
   A prova de mídia fica só na seção nova. Um quinto indicador quebraria a grade `md:grid-cols-4`: sobraria um card órfão na segunda linha no desktop, e o mobile passaria a ter três linhas. Além disso, "01 capa de revista" repetiria, com menos força, o que a seção seguinte mostra com a própria capa. O "01 Livro Publicado" continua certo: a 2ª edição é do mesmo livro que o texto da Mentora já cita.

5. **Um item pendente é um item com campo ausente, como a Cronus.**
   Mesmo padrão da Spec 011, decisão 3: `cover` e `url` são opcionais no tipo `MediaAppearance`. Sem `cover`, o card mostra a célula da imagem com o nome do veículo escrito. Sem `url`, o card não vira link — nada de `href="#"`, que levaria o visitante ao topo da página. Quando o material chegar, a mudança é preencher os campos de uma linha do array.

6. **Imagens de mídia em `public/assets/midia/`, com `NgOptimizedImage` e célula de tamanho fixo.**
   Os arquivos saem de `libs/` renomeados em *kebab-case* sem acento, como na Spec 011, e são publicados em `.webp` (tabela em "Material recebido"). Cada item carrega as dimensões intrínsecas reais do arquivo publicado. As quatro peças têm proporções diferentes: a capa da revista é 4:5, a miniatura da Hapo é 16:9, o reel da Conexão é 9:16 e a foto do livro é 436×599 (~3:4). Cortar todas numa proporção comum com `object-cover` tiraria o nome da revista da capa e o título do episódio do reel. Por isso a imagem fica numa célula de altura fixa com `object-contain` (Spec 011, decisão 8), e os cards de uma mesma linha ficam com a mesma altura.
   - **Fundo desfocado, e não cor sólida.** A revista e a Hapo têm fundo escuro, mas o reel e a foto do livro são claros, então nenhuma cor única preenche as sobras sem parecer tarja. Atrás da peça, a célula repete a mesma imagem com `object-cover`, `blur` e opacidade reduzida (`alt=""`, `aria-hidden="true"`). É o mesmo arquivo e a mesma URL, então o navegador não faz uma segunda requisição. O `alt` descreve a peça, como na tabela, e nunca é um "imagem" genérico.

7. **Hierarquia: seção em `<h2>`, títulos dos cards em `<h3>`.**
   O `<h2>` vem do `ui-section-header` (nível padrão desde a Spec 009, Task 4.10), e o `ui-media-card` renderiza o título em `<h3>`. A landing continua com um único `<h1>`, no hero.

8. **A landing ganha o schema `Person`, com as aparições em `subjectOf`.**
   O pedido supunha que as aparições entrariam "no schema da landing", mas a landing não declara JSON-LD hoje: o `JsonLdService` só é usado em `/cursos/:slug`. A landing passa a chamar `jsonLd.set()` com um `Person` (Lidiane Delcastanher, cargo, organização `Delcastanher`). O `subjectOf` desse `Person` lista cada aparição com nome, data e URL. O tipo segue onde a peça está publicada: a matéria da Prospere é `Article`, e os dois podcasts, que são páginas de vídeo (YouTube e reel do Instagram), são `VideoObject`, com `thumbnailUrl` (a capa hospedada no próprio site) e `uploadDate`, os campos que o Google exige desse tipo. `PodcastEpisode` fica reservado para episódios publicados em plataforma de áudio. A troca de rota já está resolvida: o `App` limpa os blocos a cada `NavigationStart`.
   - **`subjectOf`, e não `sameAs`.** `sameAs` serve para perfis da mesma pessoa (LinkedIn, Instagram), não para conteúdo sobre ela. Os links de LinkedIn e Instagram do footer ainda são `href="#"`, então o `sameAs` fica de fora (ver "Fora de escopo").
   - **O livro fica fora do `subjectOf`.** `subjectOf` é conteúdo *sobre* a pessoa, e o livro é obra *dela*: a Lidiane é coautora, não assunto. O link do card é um post do próprio perfil, que também não é fonte de terceiros. Um schema `Book` com a Lidiane em `author` pediria ISBN e a lista de coautores para não ficar pela metade, e isso fica fora de escopo.
   - **Item pendente não entra no schema.** Uma aparição sem `url` não vai para o `subjectOf`, pela mesma regra que tirou o `offers` do `Course` na Spec 009: dado estruturado não descreve o que não está confirmado.
   - **Seguro no prerender.** O `JsonLdService` escreve via `DOCUMENT`, então o bloco sai no HTML gerado no build, sem depender de `window`.

9. **As quatro imagens da landing passam a `NgOptimizedImage` com dimensões intrínsecas.**

   | Imagem | Arquivo | Dimensões | Carregamento |
   |---|---|---|---|
   | Hero | `assets/aula1.jpeg` | 1280×852 | `priority` |
   | Mentora | `assets/nova_mentora.jpeg` | 1130×1392 | lazy (padrão) |
   | Metodologia 1 | `assets/aula2.jpeg` | 1280×852 | lazy (padrão) |
   | Metodologia 2 | `assets/aula1.jpeg` | 1280×852 | lazy (padrão) |

   O hero recebe `priority` (preload + `fetchpriority="high"` no HTML prerenderizado). Com a decisão 11 ele vira fundo e passa a aparecer também no mobile, então é o candidato a LCP em todos os tamanhos, e o preload nunca é desperdiçado. Como fundo, o hero usa o modo `fill` do `NgOptimizedImage` (o pai já é `relative`), que dispensa `width`/`height`; as três demais seguem com as dimensões da tabela e as classes atuais de tamanho e `object-cover`. Na execução, conferir se o console não mostra avisos `NG0295x` de proporção ou de tamanho.

10. **Mobile-first.**
    Os cards ficam empilhados em uma coluna no mobile, passam a duas a partir de `md` (grade 2×2) e a quatro a partir de `xl`, numa linha só. O salto de duas para quatro, sem passar por três, evita um card órfão na segunda linha. Quatro colunas só a partir de `xl`, porque em `lg` (1024 px) cada card ficaria com cerca de 220 px, estreito demais para o player. A imagem ocupa a largura do card sem estourá-la. No desktop, os cinco itens do `navLinks` cabem no menu `md:flex`; no mobile o header não lista âncoras, então nada muda ali.

11. **Hero: foto como fundo à direita, texto à esquerda sobre o gradiente que se dissolve.**
    A foto é a mesma de hoje (`assets/aula1.jpeg`). A Lidiane ocupa a metade direita do quadro e a plateia fica à esquerda, então a plateia fica sob o gradiente, e ela fica livre.
    - **"Fundo" não é `background-image` em CSS.** Um `background-image` fica fora do `NgOptimizedImage` (regra do `CLAUDE.md`), não recebe preload nem `fetchpriority` e não tem `alt`. A foto é um `<img ngSrc fill priority>` posicionado atrás do conteúdo, com `object-cover` e o ponto focal no rosto (`object-position` em torno de `70% 30%`). Visualmente é um fundo, e continua sendo a imagem LCP. O `alt` atual ("Lidiane Delcastanher palestrando para uma turma") continua, porque a foto é conteúdo, não decoração.
    - **Camadas:** foto (`z-0`) → camada de gradiente (`z-10`) → texto e CTAs (`z-20`).
    - **O gradiente é o `bg-gradient-hero` da casa, sem cor nova.** Para ele "invadir e sumir", a camada leva uma máscara horizontal: opaca até cerca de 45% da largura, transparente a partir de cerca de 65%. A máscara apaga a camada sem mudar as cores do gradiente, que continuam idênticas às do `/planos`, do `/cursos/:slug` e do `/login`. Um gradiente reescrito com transparência criaria uma quarta variação do tom da marca. Tailwind 3 não tem utilitário de máscara, então entra uma classe `.hero-fade` no `styles.scss`, com `mask-image` e `-webkit-mask-image` (o Safari ainda exige o prefixo).
    - **Imagem no bloco direito, não na largura toda.** No desktop a foto ocupa só os ~65% à direita do hero (`absolute inset-y-0 right-0`), e o gradiente cobre a coluna do texto e a borda esquerda da foto. O arquivo tem 1280 px de largura: esticado em 100% de um monitor de 1920 px, seria ampliado 1,5× e perderia nitidez. No bloco de 65%, a ampliação fica perto de 1×. Se existir o original da foto em resolução maior, ele substitui este arquivo.
    - **Texto:** a coluna fica à esquerda com `max-w-xl` (hoje `md:w-1/2`) e nunca avança sobre a área transparente da máscara. A coluna da direita, com a foto flutuante (`animate-float`, `rounded-3xl`, `shadow-glass-lg`) e o blob atrás dela, sai do template.
    - **Blobs:** o `blob-teal` da esquerda fica, porque vive sob o texto. O `blob-navy` branco do canto inferior direito sai: ele cairia sobre a foto como uma névoa sem função.
    - **Altura:** o hero ganha `min-h` no desktop (em torno de 600 px), para a foto não ser cortada rente ao rosto quando o texto for curto. Hoje a altura é só a do conteúdo.
    - **Mobile: a mesma regra, girada 90°.** Não há largura para texto e foto lado a lado, então eles empilham: a foto fica no topo, o texto embaixo, e o gradiente sobe um pouco sobre a base da foto e some antes de alcançar a Lidiane. Hoje a foto está `hidden` abaixo de `md`; passa a aparecer.
      - **Foto:** bloco no topo, com a largura toda e altura fixa em torno de `26rem`. O `object-cover` mantém o ponto focal no rosto, e como ela está a ~70% da largura do arquivo, o recorte estreito do celular a centraliza.
      - **Máscara vertical:** abaixo de `md`, a `.hero-fade` troca a máscara horizontal por uma vertical. A camada é transparente do topo até perto da base da foto, fica opaca na base e continua opaca sob todo o texto. A faixa de transição tem cerca de `6rem` e fica sobre o tronco dela, abaixo do rosto.
      - **Altura compartilhada:** a altura da foto e os pontos da máscara saem da mesma variável CSS (`--hero-photo-h`), declarada no `<header>`. Mudar a altura da foto move a transição junto, e o gradiente nunca sobe até o rosto nem deixa uma linha dura na base da foto.
      - **Texto:** fica abaixo da foto, alinhado à esquerda como no desktop e inteiro sobre a parte opaca do gradiente. O contraste do texto branco é o mesmo de hoje, porque não há foto por trás dele.
      - **A partir de `md`**, vale o layout lado a lado descrito acima, com a máscara horizontal.
    - **Só a landing muda.** `/planos`, `/cursos/:slug` e `/login` usam o mesmo `bg-gradient-hero` e ficam como estão.

## Integração com o existente
- `features/landing/landing.ts`: tipo novo `MediaAppearance` e lista `media`; entrada `#midia` no `navLinks`; injeção do `JsonLdService` para o `Person`.
- `features/landing/landing.html`: hero reestruturado (decisão 11); seção nova depois da citação; `ngSrc` nas quatro imagens.
- `src/styles.scss`: classe `.hero-fade` com a máscara do gradiente do hero.
- `shared/ui/media-card/`: componente novo, na mesma estrutura do `ui-logo-marquee`.
- `ui-section-header`, `ui-badge`, `JsonLdService` e `AnimateOnScroll` são reaproveitados sem alteração.

## Testes
- **`landing.spec.ts`:**
  - a seção `#midia` renderiza com `<h2>` e um card por item de `media`;
  - todo link externo da seção tem `target="_blank"` e `rel` com `noopener`;
  - item sem `url` não renderiza `<a>`;
  - `navLinks` contém `#midia`;
  - a imagem do hero é renderizada em todos os tamanhos (sem `hidden`), com `fetchpriority="high"` e o `alt` descritivo;
  - o `<head>` recebe um JSON-LD `Person` cujo `subjectOf` exclui os itens pendentes.
- **`media-card.spec.ts`:**
  - título em `<h3>`, selo por tipo, `alt` repassado, estado pendente sem imagem e sem link;
  - com `embed`, nenhum `<iframe>` no DOM antes do clique;
  - o clique no play renderiza o `<iframe>` com `title` preenchido e `src` em `youtube-nocookie.com/embed/<id>` (YouTube) ou `instagram.com/reel/<id>/embed/` (Instagram);
  - `id` fora do formato não gera botão de play nem iframe, e o card fica com capa + link.

## Fora de escopo
- Embed de plataformas de áudio (Spotify, Deezer): nesta spec só YouTube e Instagram têm player. Um episódio de áudio que chegar depois entra como preview com link, até decidirmos o embed dele.
- Links reais de LinkedIn e Instagram no footer, e o `sameAs` do `Person` que depende deles. O perfil do Instagram (`@lidianedelcastanher`) já é conhecido pelo post do livro, mas o footer é outra seção.
- Schema `Book` para o livro (decisão 8).
- `<picture>` / imagem por breakpoint e loader de CDN para o `NgOptimizedImage`.
- O mesmo tratamento de hero em `/planos`, `/cursos/:slug` e `/login`.
- Tornar a lista de mídia administrável pelo painel: ela segue no componente, como todo o conteúdo de marketing da landing.
- Alterações no `ui-article-card` e no `/ava/artigos`.
