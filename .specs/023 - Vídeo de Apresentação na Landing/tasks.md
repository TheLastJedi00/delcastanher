# Tasks: Spec 023 - Vídeo de Apresentação na Landing

Spec só de `front/` (Angular standalone + signals + Tailwind). Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas estão no `context.md`.

Ordem das fases:
1. O upload no YouTube vem primeiro, porque é o usuário quem faz e dele sai o `id`. A Fase 2 não depende dele: o código sobe com a constante vazia, e a seção só aparece quando o `id` entra.
2. Depois vem o código.
3. A verificação em produção fecha a spec.

## Fase 1: YouTube (usuário)
- [ ] **Task 1.1:** Com o usuário, decidir e registrar aqui (decisão 1):
  - o canal: da Lidiane ou da Delcastanher;
  - a visibilidade: não listado ou público.
- [ ] **Task 1.2:** O usuário sobe a "Chamada módulo 1" no canal escolhido. Conferir a legenda automática em português no Studio e corrigir se precisar (decisão 7).
- [ ] **Task 1.3:** Registrar aqui o `id` do vídeo (11 caracteres) e a data do upload.

## Fase 2: Front - Seção "Conheça a Imersão"
- [ ] **Task 2.1:** Extrair um quadro do vídeo como pôster (JPEG ou WebP, 1024×576), salvar em `front/public/assets/` e registrar aqui de que segundo do vídeo ele saiu (decisão 4).
- [ ] **Task 2.2:** Tirar a regra do YouTube (padrão do `id` e URL do embed) de `media-card.ts` para um arquivo próprio em `shared/ui/`, e fazer o `ui-media-card` importá-la. A suíte do card tem que passar sem mudança (decisão 3).
- [ ] **Task 2.3:** Criar o `ui-youtube-facade` (decisões 2, 3 e 7):
  - entradas `id`, `title` e `poster`;
  - 16:9, com o pôster por `NgOptimizedImage` e o botão com `aria-label`;
  - no clique, o `<iframe>` do `youtube-nocookie.com` com `autoplay=1&rel=0` e `title`;
  - com `id` inválido, só o pôster.
- [ ] **Task 2.4:** Montar a seção entre a hero e "A Mentora" (decisão 6), com `ui-section-header`, frase, player e o CTA para `/cursos/imersao-rh`. O `id` fica numa constante em `landing.ts`, e a seção fica em `@if` enquanto ela estiver vazia.
- [ ] **Task 2.5:** Acrescentar o `VideoObject` da chamada ao `subjectOf` do `personSchema()`, com `embedUrl`, e com `url` só se o vídeo for público (decisão 8).
- [ ] **Task 2.6:** Cobrir nos specs:
  - pôster e botão sem `<iframe>` antes do clique;
  - o clique montando o `<iframe>` certo;
  - `id` inválido sem botão;
  - a seção ausente com a constante vazia;
  - o `VideoObject` no JSON-LD.
- [ ] **Task 2.7:** Rodar `ng test` e `ng build`. Conferir no HTML pré-renderizado de `/` a seção com o pôster e sem `<iframe>`.

## Fase 3: Verificação em Produção
- [ ] **Task 3.1:** Tocar o vídeo no Chrome do desktop, no Safari do iPhone e no Chrome do Android.
- [ ] **Task 3.2:** Na aba de rede, conferir que antes do clique nenhuma requisição vai a `youtube.com`, `youtube-nocookie.com`, `ytimg.com` ou `googlevideo.com` (decisão 2).
- [ ] **Task 3.3:** Tocar algumas vezes, numa janela anônima, e registrar aqui:
  - se aparece anúncio antes do vídeo;
  - o que aparece no fim (`rel=0`).
- [ ] **Task 3.4:** Conferir se a Política de Cookies publicada cita o YouTube. Se não citar, ajustar o texto pelo painel (decisão 9).
- [ ] **Task 3.5:** Conferir a navegação por teclado até o botão de reproduzir, e o `aria-label`.
- [ ] **Task 3.6:** Validar a landing no [Rich Results Test](https://search.google.com/test/rich-results) e registrar aqui se o `VideoObject` foi reconhecido.
