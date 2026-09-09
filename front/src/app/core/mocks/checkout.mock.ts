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
