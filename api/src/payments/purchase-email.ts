import { renderEmail } from '../mail/email-content';

/** O que o e-mail "Compra confirmada" precisa saber do pedido. */
export interface PurchaseEmailInput {
  buyerName: string | null;
  /** Titulos congelados nos itens do pedido. */
  items: string[];
  /** Pacote e lote (Spec 019); nulo no pedido avulso. */
  bundle: { title: string; tierName: string } | null;
  amountCents: number;
  method: 'PIX' | 'CARD';
  installments: number;
  /** Primeiro acesso do pedido a vencer; nulo se nenhum foi registrado. */
  accessUntil: Date | null;
  /** Endereco da area do aluno (`/ava`). */
  platformUrl: string;
}

export interface PurchaseEmail {
  subject: string;
  html: string;
  text: string;
}

/** Datas no fuso da empresa, como o certificado (Spec 023, Parte D). */
const DATE = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

function money(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function paymentLabel(input: PurchaseEmailInput): string {
  if (input.method === 'PIX') {
    return 'no PIX';
  }

  return input.installments > 1 ? `no cartão, em ${input.installments}x` : 'no cartão, à vista';
}

/** O pacote aparece como uma linha so, e nao como 12 titulos (Spec 019, decisao 14). */
function purchasedLines(input: PurchaseEmailInput): string[] {
  if (input.bundle) {
    return [`- ${input.bundle.title} · ${input.bundle.tierName} (${input.items.length} módulos)`];
  }

  return input.items.map((title) => `- ${title}`);
}

/**
 * E-mail "Compra confirmada" (Spec 024, decisao D6).
 *
 * **Transacional**, como o da nota fiscal (Spec 023, decisao B5): sem
 * descadastro, porque e documento da compra. O corpo passa pelo mesmo
 * `renderEmail` das campanhas, que escapa tudo — os titulos vem do banco.
 */
export function purchaseConfirmationEmail(input: PurchaseEmailInput): PurchaseEmail {
  const firstName = (input.buyerName ?? '').trim().split(/\s+/)[0];

  const body = [
    firstName ? `Olá, ${firstName}!` : 'Olá!',
    'Sua compra na Delcastanher foi confirmada. Seu acesso já está liberado.',
    ['O que você comprou:', ...purchasedLines(input)].join('\n'),
    `Valor: ${money(input.amountCents)} ${paymentLabel(input)}.`,
    ...(input.accessUntil ? [`Seu acesso vale até ${DATE.format(input.accessUntil)}.`] : []),
    `Para começar, entre na plataforma: ${input.platformUrl}`,
    'Se você não reconhece esta compra ou precisa de ajuda, fale com a gente pelo WhatsApp: https://wa.me/5547992908953',
  ].join('\n\n');

  const content = renderEmail({ body, preheader: 'Seu acesso à Imersão RH Estratégico está liberado' });

  return {
    subject: 'Compra confirmada: seu acesso à Imersão RH Estratégico',
    html: content.html,
    text: content.text,
  };
}
