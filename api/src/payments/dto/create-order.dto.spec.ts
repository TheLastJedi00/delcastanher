import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto, MAX_INSTALLMENTS } from './create-order.dto';

const PAYER = {
  firstName: 'Ana',
  lastName: 'Souza',
  email: 'aluno@delcastanher.com',
  document: '19119119100',
  address: {
    zip: '01310100',
    street: 'Avenida Paulista',
    number: '1000',
    district: 'Bela Vista',
    city: 'São Paulo',
    cityIbge: '3550308',
    state: 'SP',
  },
};

async function errorsOf(payload: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateOrderDto, { method: 'PIX', payer: PAYER, ...payload }));

  // Recursivo: o endereco fica um nivel abaixo do pagador.
  const flatten = (list: typeof errors): string[] =>
    list.flatMap((error) => [
      ...Object.values(error.constraints ?? {}),
      ...flatten(error.children ?? []),
    ]);

  return flatten(errors);
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

  /** Spec 023, decisao A3: a NF-e exige o endereco do destinatario. */
  describe('endereco do comprador', () => {
    const withAddress = (address: Record<string, unknown> | undefined) =>
      errorsOf({ moduleIds: ['mod-1'], payer: { ...PAYER, address } });

    it('aceita o endereco completo, com ou sem complemento', async () => {
      expect(await withAddress(PAYER.address)).toEqual([]);
      expect(await withAddress({ ...PAYER.address, complement: 'Apto 3' })).toEqual([]);
    });

    it('recusa o pedido sem endereco', async () => {
      expect(await withAddress(undefined)).toContain('Informe o endereço.');
    });

    it('recusa CEP fora de 8 digitos', async () => {
      expect(await withAddress({ ...PAYER.address, zip: '01310-100' })).toContain(
        'Informe um CEP válido.',
      );
    });

    it('recusa codigo IBGE fora de 7 digitos', async () => {
      expect(await withAddress({ ...PAYER.address, cityIbge: '355030' })).toContain(
        'Cidade sem código IBGE. Confira o CEP.',
      );
    });

    it('recusa UF que nao existe', async () => {
      expect(await withAddress({ ...PAYER.address, state: 'XX' })).toContain('UF inválida.');
    });

    it('recusa numero e logradouro vazios', async () => {
      expect(await withAddress({ ...PAYER.address, number: '' })).toContain('Informe o número.');
      expect(await withAddress({ ...PAYER.address, street: '  ' })).toContain(
        'Informe o logradouro.',
      );
    });
  });
});
