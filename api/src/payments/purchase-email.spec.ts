import { purchaseConfirmationEmail, PurchaseEmailInput } from './purchase-email';

const BASE: PurchaseEmailInput = {
  buyerName: 'Ana Souza',
  items: ['Módulo 1: Fundamentos do RH', 'Módulo 2: Diagnóstico'],
  bundle: null,
  amountCents: 39800,
  method: 'PIX',
  installments: 1,
  accessUntil: new Date('2027-04-05T15:00:00.000Z'),
  platformUrl: 'https://www.delcastanher.srv.br/ava',
};

/**
 * E-mail "Compra confirmada" (Spec 024, decisao D6). Funcao pura: o servico so
 * busca os dados e envia, e o texto inteiro e conferido aqui.
 */
describe('purchaseConfirmationEmail', () => {
  it('cumprimenta pelo primeiro nome e lista os modulos comprados', () => {
    const email = purchaseConfirmationEmail(BASE);

    expect(email.text).toContain('Olá, Ana!');
    expect(email.text).toContain('Módulo 1: Fundamentos do RH');
    expect(email.text).toContain('Módulo 2: Diagnóstico');
    expect(email.subject).toBe('Compra confirmada: seu acesso à Imersão RH Estratégico');
  });

  it('mostra o pacote e o lote no lugar dos 12 titulos', () => {
    const email = purchaseConfirmationEmail({
      ...BASE,
      items: Array.from({ length: 12 }, (_, index) => `Módulo ${index + 1}`),
      bundle: { title: 'Pacote de Lançamento', tierName: 'Lote Fundador' },
    });

    expect(email.text).toContain('Pacote de Lançamento · Lote Fundador (12 módulos)');
    expect(email.text).not.toContain('Módulo 7');
  });

  it('valor em reais com o metodo: PIX, cartao a vista e parcelado', () => {
    // `toLocaleString` usa espaco nao separavel depois do "R$".
    const money = (text: string) => text.replace(/ /g, ' ');

    expect(money(purchaseConfirmationEmail(BASE).text)).toContain('R$ 398,00 no PIX');
    expect(money(purchaseConfirmationEmail({ ...BASE, method: 'CARD' }).text)).toContain(
      'R$ 398,00 no cartão, à vista',
    );
    expect(
      money(purchaseConfirmationEmail({ ...BASE, method: 'CARD', installments: 6 }).text),
    ).toContain('R$ 398,00 no cartão, em 6x');
  });

  it('diz ate quando o acesso vale, na data de Sao Paulo', () => {
    // 01:00 UTC do dia 6 ainda e dia 5 em Sao Paulo.
    const email = purchaseConfirmationEmail({
      ...BASE,
      accessUntil: new Date('2027-04-06T01:00:00.000Z'),
    });

    expect(email.text).toContain('Seu acesso vale até 05/04/2027.');
  });

  it('leva o link da plataforma, clicavel no HTML', () => {
    const email = purchaseConfirmationEmail(BASE);

    expect(email.text).toContain('https://www.delcastanher.srv.br/ava');
    expect(email.html).toContain('<a href="https://www.delcastanher.srv.br/ava">');
  });

  // Transacional: e documento da compra, como o e-mail da nota (Spec 023, B5).
  it('nao tem link nem texto de descadastro', () => {
    const email = purchaseConfirmationEmail(BASE);

    expect(email.html).not.toContain('Cancelar inscrição');
    expect(email.text).not.toContain('Cancelar inscrição');
  });

  it('escapa o que veio do banco', () => {
    const email = purchaseConfirmationEmail({ ...BASE, items: ['<script>alert(1)</script>'] });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('sem nome, cumprimenta sem nome', () => {
    expect(purchaseConfirmationEmail({ ...BASE, buyerName: null }).text).toContain('Olá!');
  });

  it('sem acesso registrado, nao inventa data', () => {
    const email = purchaseConfirmationEmail({ ...BASE, accessUntil: null });

    expect(email.text).not.toContain('Seu acesso vale até');
  });
});
