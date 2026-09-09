import { findCourseBySlug } from './courses.mock';
import { PLACEHOLDER } from './placeholders';
import { Plan, PLANS } from './plans.mock';

/**
 * Produto sendo comprado no mockup de checkout (Spec 007).
 *
 * O checkout nao conhece "curso" nem "plano": as duas fontes existentes sao
 * normalizadas para este formato unico, entao a tela nao precisa de dois
 * caminhos de renderizacao. `price` e `priceNote` podem chegar como placeholder
 * (`[PREÇO]`) e sao exibidos com `ui-placeholder-text` — nunca cru, nunca
 * inventado (decisao 5 do context.md).
 */
export interface CheckoutProduct {
  /** Slug da rota `/checkout/:productSlug`. */
  slug: string;
  name: string;
  /** Resumo curto do que esta sendo comprado. */
  summary: string;
  price: string;
  priceNote: string;
  /** De onde o produto veio, para o resumo do pedido dizer o que e. */
  kind: 'curso' | 'plano';
}

/**
 * Um plano so tem checkout quando a venda acontece pelo gateway.
 *
 * "Mini Curso" ainda nao lancou, "Curso Individual" manda para a pagina do
 * curso e "Empresas" e vendido por proposta no WhatsApp — nenhum deles pode
 * cair numa tela de pagamento. Os que restam sao exatamente os que hoje
 * apontam para `PLACEHOLDER.checkout` no mock.
 */
export function isCheckoutPlan(plan: Plan): boolean {
  return plan.state === 'disponivel' && plan.ctaHref === PLACEHOLDER.checkout;
}

function fromPlan(plan: Plan): CheckoutProduct {
  return {
    slug: plan.id,
    name: plan.name,
    summary: plan.description,
    price: plan.price,
    priceNote: plan.priceNote,
    kind: 'plano',
  };
}

/**
 * Resolve o produto do checkout a partir do slug da rota.
 *
 * Atende as duas fontes existentes: `courses.mock.ts` (indexado por `slug`) e
 * `plans.mock.ts` (indexado por `id`, usado como slug). Slug desconhecido
 * retorna `null` e a pagina cai no fallback amigavel, como em `course-detail`.
 */
export function findCheckoutProductBySlug(
  slug: string | null | undefined
): CheckoutProduct | null {
  if (!slug) {
    return null;
  }

  const course = findCourseBySlug(slug);

  if (course) {
    return {
      slug: course.slug,
      name: course.name,
      summary: course.subheadline,
      price: course.offer.price,
      priceNote: course.offer.installments,
      kind: 'curso',
    };
  }

  const plan = PLANS.find(item => item.id === slug);

  return plan && isCheckoutPlan(plan) ? fromPlan(plan) : null;
}

/** Cenarios de resposta simulados pelo mockup. */
export type CheckoutScenario = 'aprovado' | 'recusado' | 'erro';

export interface CheckoutOutcome {
  scenario: CheckoutScenario;
  /** Codigo no formato que um gateway devolveria, para a tela ter o que exibir. */
  code: string;
  title: string;
  message: string;
  /** O que o comprador pode fazer a seguir. Vazio quando o cenario e sucesso. */
  recovery: string;
}

/**
 * Respostas simuladas do pagamento.
 *
 * Nao ha sorteio: o cenario e escolhido no seletor de demonstracao da tela de
 * pagamento (decisao 4 do context.md), porque um mockup precisa ser
 * demonstravel sob demanda. Nenhum destes codigos vem de gateway real — eles
 * existem so para as telas de resultado terem mensagem e codigo proprios.
 */
export const CHECKOUT_OUTCOMES: Record<CheckoutScenario, CheckoutOutcome> = {
  aprovado: {
    scenario: 'aprovado',
    code: 'SIM-APROVADO-00',
    title: 'Pagamento aprovado',
    message:
      'Simulação concluída: o pagamento foi aprovado e sua inscrição está confirmada nesta demonstração.',
    recovery: '',
  },
  recusado: {
    scenario: 'recusado',
    code: 'SIM-RECUSADO-51',
    title: 'Pagamento recusado',
    message:
      'Simulação concluída: a operadora recusou a cobrança. Confira os dados do cartão ou escolha outra forma de pagamento.',
    recovery: 'Voltar e tentar outro método',
  },
  erro: {
    scenario: 'erro',
    code: 'SIM-ERRO-COMM',
    title: 'Erro de comunicação',
    message:
      'Simulação concluída: não foi possível falar com o provedor de pagamento. Nenhuma cobrança foi realizada — tente novamente em instantes.',
    recovery: 'Voltar e tentar de novo',
  },
};

/** Rotulos do seletor de cenario, na ordem em que aparecem na demonstracao. */
export const CHECKOUT_SCENARIOS: { value: CheckoutScenario; label: string }[] = [
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'recusado', label: 'Recusado' },
  { value: 'erro', label: 'Erro de comunicação' },
];

/** Chave "Copia e Cola" ficticia do PIX de demonstracao. */
export const CHECKOUT_PIX_CODE =
  '00020126580014BR.GOV.BCB.PIX0136demonstracao-checkout-delcastanher5204000053039865802BR5920DELCASTANHER MOCKUP6009SAO PAULO62070503***6304DEMO';

/** Aviso exibido em todas as etapas: nenhuma cobranca acontece aqui. */
export const CHECKOUT_DEMO_NOTICE =
  'Ambiente de demonstração: nenhuma cobrança é realizada e nenhum dado de pagamento é enviado ou armazenado.';

