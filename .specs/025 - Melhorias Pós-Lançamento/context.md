# Spec 025: Melhorias Pós-Lançamento

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Specs 013, 014, 016, 019 e 023, e a triagem feita com a Spec 024.

## Objetivo
Reunir o que **pode ser resolvido depois do lançamento sem afetar a cliente nem os alunos**. Nada aqui bloqueia a entrega: o que bloqueia está na Spec 024.

Um item tem **prazo**: a tela de acesso expirado precisa estar no ar antes de vencer o primeiro acesso, ou seja, até 6 meses depois da primeira venda real.

## Itens e por que podem esperar

| # | Item | Origem | Por que pode esperar |
|---|---|---|---|
| E1 | Tela de "acesso expirado" quando o 403 chega com a aba aberta, com volta à loja e o módulo já marcado | Spec 014, task 8.3 | O acesso dura 6 meses. **Prazo:** 6 meses depois da primeira venda |
| E2 | Segmento "concluíram o curso" contando quem só tem diploma de módulo | Spec 023, B2 (Bugs) | Campanha de marketing não é necessária para lançar |
| E3 | Teste de campanha no Gmail e no Outlook, com o "Cancelar inscrição" nativo | Spec 023, task 6.8 | Idem |
| E4 | Lembrete de PIX pendente por e-mail | Spec 024, D6 | O QR e a contagem regressiva já aparecem na tela |
| E5 | `.pptx` com o rótulo "DOC": tipo `ppt` na API, no front e no ícone | Bugs | Cosmético |
| E6 | `h1` em cada aba do `/admin` | Specs 013 e 016 | Só o painel da cliente; a navegação não quebra |
| E7 | Acessibilidade fina da loja, do checkout e do `/planos`: foco entre etapas, `aria-live` no PIX, navegação por teclado na escolha pacote/avulsos | Spec 014, task 9.3; Spec 019, task 7.10 | A marcação básica (rótulos, `fieldset`, `role="alert"`) já existe. O que quebrar no celular é corrigido na Spec 024 |
| E8 | Logo do Mercado Pago e selos de segurança no pagamento, mais os itens **recomendados** da avaliação de qualidade | Spec 014, tasks 9.7 e 7.8 | Boa prática. Os itens **obrigatórios** do checklist sobem para a Spec 024 se a avaliação os apontar |
| E9 | Vídeo de apresentação na landing (YouTube) | Spec 023, tasks 7.1 e 7.6 | A seção fica escondida enquanto o id está vazio |
| E10 | Confirmações ao vivo já cobertas por testes automáticos: 403 do financeiro com papel aluno, virada de lote pelo painel, fluxo de acesso parcial e teste de ponta a ponta do painel admin | Spec 016, task 7.8; Spec 019, tasks 7.2, 7.4 e 7.7; Spec 013, task 6.5 | Cobertas por `*.http.spec` e `bundles.service.spec`; aqui é só confirmação em ambiente real |
| E11 | Melhorias de velocidade não críticas da auditoria de 2026-10-05: imagens da landing em tamanhos responsivos e formato moderno (cerca de 214 KiB a menos); imagens fora da tela da página do curso carregando sob demanda (cerca de 78 KiB); cerca de 30 KiB de JavaScript não usado por página | Spec 024, task 5.3 | Performance entre 94 e 97 e LCP de 2,2 a 2,7 s no celular: nada crítico |

## Decisões a tomar quando a spec começar
- **E2:** filtrar `moduleId: null` no segmento (só diploma do curso) ou renomear para "Alunos com algum certificado".
- **E4:** quando o lembrete sai (por exemplo, 20 minutos antes de o PIX expirar) e se ele leva o QR de novo.
