# Spec 011: Ajustes Simples — Logout do Painel e Faixa de Parceiros

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 002 (Design System), Spec 004 (Autenticação), Spec 008 (Área do Aluno) e Spec 010 (Storage e CDN)
**Escopo técnico:** somente `front/` (Angular standalone + signals + Tailwind). Nenhuma rota, model ou serviço do `api/` é tocado, então não há suíte de backend nesta spec.

## Objetivo
Duas correções pontuais sobre o que já está em produção: o "Sair" das áreas logadas passa a encerrar a sessão de verdade, e a seção "Empresas que confiam em nosso trabalho" da landing troca os nomes escritos por logos reais em um carrossel contínuo, com a lista de parceiros atualizada.

## Escopo

- **Bug de logout:** o botão "Sair" do painel administrativo — e o do AVA, que tem o mesmo defeito — passa a chamar `AuthService.logout()` antes de navegar para `/login`.
- **Conteúdo da landing:** sai a Amcom, entram Vale Automação, Efficienza, RGM Service e Acimatec.
- **Apresentação da landing:** a faixa de parceiros vira carrossel contínuo, responsivo e acessível.

## Decisões técnicas desta spec

1. **A causa do logout quebrado é o output desconectado, não o token nem o redirecionamento.**
   O `context` original supunha "erro na remoção do token, problema no redirecionamento ou falha na requisição". Nenhuma das três: `AuthService.logout()` (`core/services/auth.service.ts`) está correto — limpa sessão, perfil, progresso, certificados e o `localStorage` — e **nunca é chamado em lugar nenhum da aplicação**, só no próprio `.spec.ts`. O `ui-nav-header` emite `logout` no clique, mas o `AdminLayout` monta o header sem bindar `(logout)`. O sintoma é enganoso: a navegação para `/login` funciona, então parece ter deslogado, mas a sessão continua no `localStorage` e voltar para `/admin` reentra sem credencial. O `/login` não tem guard que rejeite quem já está autenticado, então nada corrige isso a jusante.

2. **O mesmo defeito existe no AVA, e é corrigido junto.**
   O "Sair" da `ui-sidebar` é apenas `<a routerLink="/login">` — o componente nem tem output de logout. Como a sidebar é compartilhada entre `AdminLayout` e `StudentLayout`, consertar só o header do admin deixaria duas das três portas de saída ainda quebradas. A sidebar ganha `output logout` e quem encerra a sessão continua sendo o shell, não o componente de UI: `ui-sidebar` avisa o clique, o layout injeta o `AuthService`. Componente de `shared/ui/` não conhece serviço de domínio, como já vale para o `ui-nav-header`.

3. **A Cronus fica na faixa como texto até o logo existir.**
   Os parceiros atuais são seis; removendo a Amcom e somando os quatro novos, são nove. Chegaram oito arquivos — falta o da Cronus. Removê-la seria tirar do ar um parceiro real por ausência de asset, então ela permanece na lista com o campo `logo` ausente e é renderizada com o nome escrito, no mesmo tratamento que a seção inteira usava antes. O tipo `MarqueePartner` torna o logo opcional justamente para isso; quando o arquivo chegar, a mudança é acrescentar o objeto `logo` a uma linha do array.

4. **Carrossel em CSS puro, sem biblioteca.**
   A task original mandava "analisar qual biblioteca de carrossel já está sendo utilizada": nenhuma. O `front/package.json` não tem uma única dependência de UI além do `@mux/mux-player` (que é o player de vídeo da Spec 010) — todo componente visual é feito à mão em `shared/ui/` com Tailwind. Trazer Swiper ou equivalente para uma faixa de logos abriria a primeira dependência de UI do projeto e o bundle que vem com ela. O `ui-logo-marquee` renderiza a lista duas vezes e desliza `-50%` em `@keyframes`: ao fim do ciclo a cópia está sobre a original, então o loop não tem salto.

5. **Sem setas nem paginação: a faixa é decorativa, não navegável.**
   A task pedia "setas, paginação ou autoplay". Para nove logos que ninguém precisa percorrer em ordem, controles de navegação adicionam alvos de clique e estado sem função. O movimento é contínuo e pausa no `hover`/`focus-within`, que é o que serve ao visitante querendo ler um logo específico.

6. **Reduced-motion desliga o deslize e esconde a cópia.**
   O `styles.scss` já tem um reset global de `prefers-reduced-motion` que zera `animation-duration`. Isso sozinho deixaria a trilha congelada com os logos duplicados. A faixa trata o caso explicitamente: sem animação, a cópia decorativa some (`display: none`) e o container passa a rolar na horizontal, então todos os parceiros continuam alcançáveis.

7. **Os logos entram como estáticos em `public/assets/`, com `NgOptimizedImage`.**
   É o padrão já vigente (`assets/pix-qrcode-demo.png` no checkout) e o que o `CLAUDE.md` exige. Cada item carrega as dimensões intrínsecas reais do arquivo para o `NgOptimizedImage` reservar o espaço e não causar deslocamento de layout. Os arquivos são renomeados para *kebab-case* sem acento ao sair de `.specs/011 - Ajustes Simples/libs/` — `Flexível.svg` e `Magna 1.png` não são nomes que se queira em URL pública.

8. **Célula de tamanho fixo, porque os logos não têm proporção comum.**
   Sete dos oito são lockups horizontais (a Vale é 5:1) e o do JEC é um escudo vertical (352×458). Alinhar por largura esmagaria o escudo; alinhar por altura faria a Vale ocupar três vezes o espaço dos outros. Cada item vive numa célula fixa com `object-contain`, que respeita a proporção de cada arquivo dentro do mesmo espaço. O tratamento em *grayscale* com cor no `hover` preserva a intenção visual que a seção já tinha (`text-brand-navy/30` → cheio) e resolve o choque de oito paletas de marca lado a lado.

## Integração com o existente
O `ui-logo-marquee` entra em `front/src/app/shared/ui/` no padrão dos demais (standalone, `OnPush`, `input()`, template inline). O `AuthService`, o `ui-nav-header` e o `ui-sidebar` já existem e são evoluídos, não recriados. A landing (`features/landing/`) continua sendo a mesma tela: só a seção de parceiros muda.

## Fora de escopo
- Guard que impeça um usuário já autenticado de abrir `/login` — o logout corrigido torna o cenário raro, e a regra de rota é decisão de outra spec.
- Logout no servidor (revogação de refresh token no Firebase): a sessão desta plataforma é client-side desde a Spec 004.
- Logo da Cronus e qualquer novo parceiro além dos quatro listados.
- Torna a lista de parceiros administrável pelo painel — segue hardcoded no componente, como todo o conteúdo de marketing da landing.
- Redesenho do restante da landing.
