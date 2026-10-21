import { MAX_DETAIL_BYTES, sanitizeDetail } from './payment-log.sanitize';

describe('sanitizeDetail', () => {
  it('tira token, e-mail e documento do pagador em qualquer nivel', () => {
    const clean = sanitizeDetail({
      data: {
        payer: { email: 'aluno@delcastanher.com', identification: { number: '19119119100' }, first_name: 'Ana' },
        transactions: { payments: [{ payment_method: { id: 'visa', token: 'tok-secreto' } }] },
      },
    });

    const json = JSON.stringify(clean);

    expect(json).not.toContain('tok-secreto');
    expect(json).not.toContain('aluno@delcastanher.com');
    expect(json).not.toContain('19119119100');
    expect(json).toContain('visa');
    expect(json).toContain('Ana');
  });

  it('le texto JSON e guarda texto que nao e JSON', () => {
    expect(sanitizeDetail('{"code":"x","token":"t"}')).toEqual({ code: 'x' });
    expect(sanitizeDetail('Bad Gateway')).toEqual({ text: 'Bad Gateway' });
  });

  it('corta o que passa de 10 KB', () => {
    const clean = sanitizeDetail({ big: 'a'.repeat(MAX_DETAIL_BYTES * 2) }) as {
      truncated: boolean;
      preview: string;
    };

    expect(clean.truncated).toBe(true);
    expect(clean.preview.length).toBe(MAX_DETAIL_BYTES);
  });

  it('devolve nulo para valor ausente', () => {
    expect(sanitizeDetail(undefined)).toBeNull();
  });
});
