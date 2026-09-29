# Spec 023: Vídeo de Apresentação na Landing

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 009 (SEO, Analytics e Conformidade), Spec 018 (Na Mídia: hero da landing e fachada do YouTube) e Spec 022 (Políticas e Termos pelo Painel)
**Escopo técnico:** só `front/` (Angular standalone + signals + Tailwind). Não mexe na API, no Mux nem na Vercel.
**Fonte:** `.specs/020 - Recebimento na Conta do Vendedor/libs/Vídeos/Chamada módulo 1.mp4`. São **60,6 s, 1024×576, ~726 kbps e 5,5 MB**, lidos do cabeçalho do MP4 em 2026-09-28. A pasta `libs/` fica fora do git.

## Objetivo
A landing (`/`) apresenta a Imersão só com texto e fotos. A "Chamada módulo 1" é um vídeo curto de apresentação. Esta spec o coloca na landing, logo depois da hero, para o visitante ver a Lidiane falando antes de decidir.

## Decisão: YouTube, e não Mux
A primeira versão desta spec (commit `82cabe0`) respondeu a uma pergunta: **um vídeo público no Mux abre espaço para um ataque de requisições que estoure a cobrança ou exponha o conteúdo pago?** A resposta era "sim, com teto baixo". No Mux quem paga a entrega somos nós, e o Mux não tem teto de gasto. Para mitigar, o desenho pedia:
- um asset `signed`;
- uma rota pública de token, com teste contra troca de `sub`;
- uma restrição por referrer;
- cache na CDN e rate limit no firewall;
- um alerta de uso.

**Decisão (2026-09-29): a chamada sobe no YouTube e é embutida na landing.** Isso resolve os dois riscos na origem:
- **Cobrança:** a entrega é do YouTube. Um robô assistindo em laço não gera custo nenhum para nós.
- **Conteúdo pago:** o vídeo da landing não tem ligação com o Mux. Não há conta, chave de assinatura nem rota compartilhada com as aulas, então não há token para vazar nem `sub` para trocar.

Por isso ficam fora desta spec o backend inteiro, as variáveis de ambiente e toda configuração no Mux e na Vercel.

### O preço aceito
- **Marca e funil:** o player mostra o logo do YouTube. No fim do vídeo aparecem sugestões, e `rel=0` só as limita ao mesmo canal.
- **Anúncios:** os termos do YouTube permitem anúncio em qualquer vídeo, mesmo em canal sem monetização. Um anúncio de concorrente pode aparecer antes da apresentação. Isso é conferido na Fase 3.
- **Desligar:** tornar o vídeo privado corta a reprodução na hora. Tirar a seção da landing exige deploy do front.

## Escopo
- **Upload no YouTube**, feito pelo usuário, com o `id` do vídeo registrado aqui.
- **Seção "Conheça a Imersão"** na landing, depois da hero, com a fachada do YouTube já usada na Spec 018.
- **`VideoObject`** no JSON-LD da landing.

## Decisões técnicas desta spec

1. **Canal e visibilidade: decisão do usuário, registrada na Task 1.1.**
   - O **canal** é o dono do vídeo. É nele que ficam o desligamento e as legendas.
   - **Não listado** é o padrão sugerido: o vídeo não aparece na busca do YouTube, mas o `id` fica exposto na landing de qualquer jeito. **Público** soma descoberta pelo YouTube.
   - Qualquer das duas escolhas funciona com o resto da spec.

2. **Fachada: nada vai ao YouTube antes do clique.**
   É o mesmo padrão da Spec 018 (decisão 5), no `ui-media-card`:
   - **Antes do clique:** existe só o pôster local, servido por `NgOptimizedImage`, com o botão de reproduzir por cima. Nenhum script entra no LCP e nenhum cookie é gravado antes do banner da Spec 009.
   - **Depois do clique:** nasce o `<iframe>` de `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&rel=0`.
   - O `id` passa por `^[\w-]{11}$` antes de virar `ResourceUrl`. Se não casar, não há botão, só o pôster.
   - O `<iframe>` nunca sai no HTML pré-renderizado.

3. **Um componente de player, compartilhado com o `ui-media-card`.**
   Hoje a regra do YouTube (formato do `id` e URL do embed) vive em `EMBEDS`, dentro de `shared/ui/media-card/media-card.ts`.
   - A regra sai para um arquivo próprio em `shared/ui/`, e o `ui-media-card` passa a importá-la.
   - Nasce um `ui-youtube-facade`: recebe `id`, `title` e `poster` (`src` e `alt`), e ocupa 16:9.
   - O `ui-media-card` pode continuar com o próprio template. A exigência é uma fonte só para o padrão do `id` e a URL.
   - `rel=0` entra só no embed da landing. O card da Spec 018 continua como está.

4. **Pôster local, e não a thumbnail do YouTube.**
   Um quadro do vídeo, salvo em `front/public/assets/` (JPEG ou WebP, 1024×576). A thumbnail do `i.ytimg.com` seria uma requisição ao Google antes do clique, justamente o que a decisão 2 evita.

5. **Sem autoplay.** O vídeo só toca no clique. Autoplay pesaria no carregamento da landing e tocaria para quem só rola a página.

6. **O vídeo entra depois da hero, numa seção própria.**
   A hero da Spec 018 tem foto de fundo e texto, e um vídeo dentro dela competiria com a foto e com o CTA. A seção nova, **"Conheça a Imersão"**, fica entre a hero e "A Mentora", com:
   - o `ui-section-header`;
   - uma frase;
   - o player em 16:9, centralizado e com largura máxima;
   - o CTA "Quero me Inscrever Agora" abaixo, levando a `/cursos/imersao-rh` como o da hero.

   O `id` fica numa constante em `landing.ts`. Enquanto ela estiver vazia, a seção não aparece (`@if`), para o código poder subir antes do upload.

7. **Acessibilidade.**
   - O botão de reproduzir tem `aria-label` "Reproduzir: apresentação da Imersão RH Estratégico".
   - O `<iframe>` tem `title`.
   - **Legenda:** a legenda automática do YouTube em português é conferida no Studio depois do upload e corrigida se precisar (Task 1.2).

8. **SEO: `VideoObject` no `Person` da landing.**
   A landing já declara aparições da Lidiane em `subjectOf` (Spec 018, decisão 8). A chamada entra ali como `VideoObject` com:
   - `name` e `description`;
   - `thumbnailUrl`, o pôster com `SITE_ORIGIN`;
   - `uploadDate`, a data do upload;
   - `embedUrl` do `youtube-nocookie`.

   Vai junto de `url` (`youtube.com/watch?v=<id>`) só se o vídeo for público. Um não listado não deve ser apontado ao buscador como página própria.

9. **Política de Cookies.**
   Depois do clique, o YouTube grava identificadores, e o card da Spec 018 já é aceito nessa mesma situação. Confere-se se a política publicada pelo painel (Spec 022) cita o YouTube. Se não citar, o texto é ajustado **pelo painel**, sem mudança de código.

## Integração com o existente
- **`front/src/app/shared/ui/`:** a regra do YouTube em arquivo próprio e o `ui-youtube-facade`.
- **`front/src/app/shared/ui/media-card/media-card.ts`:** passa a importar a regra, sem mudança visível.
- **`front/src/app/features/landing/`:** a seção, a constante do `id` e o `VideoObject` no `personSchema()`.
- **`front/public/assets/`:** o pôster da chamada.

## Testes

### Front
- A seção mostra o pôster e o botão, sem `<iframe>` antes do clique.
- O clique monta o `<iframe>` do `youtube-nocookie.com` com `autoplay=1&rel=0` e o `title`.
- Um `id` fora do formato não gera botão nem `<iframe>`.
- Com a constante vazia, a seção não aparece.
- O `ui-media-card` continua passando na sua suíte, sem mudança.
- O JSON-LD da landing tem o `VideoObject` da chamada com `embedUrl`, e com `url` só se o vídeo for público.
- Nenhum `<iframe>` no HTML pré-renderizado de `/`.

### Em produção
- O vídeo toca no Chrome do desktop, no Safari do iPhone e no Chrome do Android.
- Antes do clique, a aba de rede não mostra requisição a `youtube.com`, `youtube-nocookie.com`, `ytimg.com` ou `googlevideo.com`.

## Fora de escopo
- Qualquer vídeo da landing no Mux, com a rota de token, a restrição por referrer, o cache, o firewall e o alerta de uso da primeira versão.
- Troca do vídeo pelo painel. Hoje, trocar é mudar a constante e fazer deploy.
- Autoplay, vídeo de fundo na hero e vídeo em `/cursos/imersao-rh`.
- Analytics de exibição.
