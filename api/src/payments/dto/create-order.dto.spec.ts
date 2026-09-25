import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto, MAX_INSTALLMENTS } from './create-order.dto';

const PAYER = {
  firstName: 'Ana',
  lastName: 'Souza',
  email: 'aluno@delcastanher.com',
  document: '19119119100',
};

async function errorsOf(payload: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateOrderDto, { method: 'PIX', payer: PAYER, ...payload }));

  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...(error.children ?? []).flatMap((child) => Object.values(child.constraints ?? {})),
  ]);
}

/** Spec 019, decisoes 5 e 9. */
describe('CreateOrderDto', () => {
  it('aceita um pedido de modulos avulsos', async () => {
    expect(await errorsOf({ moduleIds: ['mod-1'] })).toEqual([]);
  });

  it('aceita um pedido de pacote pelo slug', async () => {
    expect(await errorsOf({ bundleSlug: 'imersao-rh-lancamento' })).toEqual([]);
  });

  it('recusa pacote e modulos no mesmo pedido', async () => {
    const errors = await errorsOf({ bundleSlug: 'imersao-rh-lancamento', moduleIds: ['mod-1'] });

    expect(errors).toContain('Escolha o pacote ou os modulos, nunca os dois.');
  });

  it('recusa pedido sem pacote e sem modulos', async () => {
    expect(await errorsOf({})).toContain('Escolha o pacote ou ao menos um modulo.');
    expect(await errorsOf({ moduleIds: [] })).toContain('Escolha o pacote ou ao menos um modulo.');
  });

  it('recusa slug fora do formato', async () => {
    expect((await errorsOf({ bundleSlug: 'Pacote Lançamento!' })).length).toBeGreaterThan(0);
  });

  it('aceita ate 12 parcelas e recusa 13', async () => {
    expect(MAX_INSTALLMENTS).toBe(12);

    const card = { token: 'tok', paymentMethodId: 'master' };

    expect(
      await errorsOf({ moduleIds: ['mod-1'], method: 'CREDIT_CARD', card: { ...card, installments: 12 } }),
    ).toEqual([]);
    expect(
      await errorsOf({ moduleIds: ['mod-1'], method: 'CREDIT_CARD', card: { ...card, installments: 13 } }),
    ).toContain('Parcelamento maximo de 12x.');
  });
});
