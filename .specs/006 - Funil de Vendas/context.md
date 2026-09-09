# Spec 006: Funil de Vendas - Página do Curso e Planos

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 002 (Design System) e Spec 005 (CRUD Usuários)
**Escopo técnico:** exclusivamente front-end (`front/`). Nenhuma alteração em `api/` — todo conteúdo vem de mocks no front.

## Objetivo
Criar os templates das páginas focadas em fechar a venda, utilizando:
- Gatilhos mentais (foco especial em **Tempo e Escassez**).
- Clareza de entregáveis.
- Arquitetura de informação otimizada para campanhas de Ads.
- **Padrão de Design:** Seguir estritamente o Design System da Spec 002 (tokens `brand-navy`, `brand-teal`, glassmorphism discreto, gradientes sutis, `AnimateOnScroll`) e reutilizar os componentes de `front/src/app/shared/ui/`.

## Escopo

### 1. Template de Curso Individual
Layout detalhado para apresentar um curso específico, na rota paramétrica **`/cursos/:slug`** (o mock carrega o curso pelo slug; hoje existe apenas `imersao-rh`, mas a estrutura já suporta os novos cursos previstos). Deve incluir:
- **Promessa (Headline)**
- **Problema que resolve**
- **Resultados esperados** (capacitações ao final do curso)
- **Grade curricular** (módulos)
- **Bônus**
- **Investimento** (aplicando gatilhos de tempo/escassez)
- **Garantias**
- **FAQ** específico do produto

### 2. Página de Planos e Soluções
Rota **`/planos`**. Reestruturação da visualização de pacotes, detalhando claramente o que cada plano inclui e os benefícios, além de preparar espaço visual para um produto de entrada (Mini Curso, exibido com sinalização de **"Em breve"**).
Pacotes a serem incluídos:
- Curso Individual
- Trilhas
- Formação Completa
- Empresas

> **Nota de nomenclatura:** o pacote "Trilhas" (comercial) não se confunde com a rota `/ava/trilha` (área do aluno). Os textos devem deixar a distinção clara.

### 3. Gestão de Placeholders
Garantir que todos os dados não existentes utilizem placeholders visuais claros (ex: `[CURSO A SER CADASTRADO]`, `[PREÇO]`) sem inventar dados comerciais reais.
Dados comuns que precisarão de placeholders:
- Preços
- Novos cursos
- Depoimentos em vídeo
- Garantias e prazos
- Vagas/turmas

## Decisões técnicas desta spec

1. **Rota do curso é paramétrica** (`/cursos/:slug`), resolvida contra um mock indexado por slug — evita criar um componente novo a cada produto lançado.
2. **Escassez sem timer funcional.** Um countdown exigiria uma data-alvo real, o que conflita com a regra de não inventar dados comerciais. Nesta spec a urgência é entregue por **banner estático** com textos placeholder (`[TURMA ENCERRA EM]`, `[VAGAS RESTANTES]`). O componente `ui-countdown` fica para spec futura, quando houver calendário de turmas definido.
3. **CTA de compra sem checkout.** Não existe gateway de pagamento no projeto. Os botões ficam visualmente completos apontando para `[LINK DE CHECKOUT]`, centralizado em constante de mock para troca única quando o gateway for definido.
4. **Onde ficam os mocks.** O padrão atual do projeto é dado mockado inline no `.ts` do componente (`landing.ts`, `trilha.ts`, `artigos.ts`), e `core/services/mock-data.service.ts` está apenas com stubs vazios (e gravado em UTF-16). Como os dados de venda são compartilhados entre `/cursos/:slug` e `/planos`, esta spec centraliza tudo em arquivos de mock tipados sob `front/src/app/core/mocks/` (`courses.mock.ts`, `plans.mock.ts`), com interfaces exportadas — sem tocar no `MockDataService` legado.

## Integração com o site existente
As páginas novas não podem nascer órfãs. Hoje o único CTA da landing aponta para `/login`. Esta spec também ajusta:
- `nav-header` (variant `landing`): novo link **Planos** → `/planos`.
- CTA do hero da landing: passa a apontar para `/planos` (ou para o curso), mantendo `/login` como acesso de aluno.
- `footer`: links para `/planos` e para o curso.
