import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it('aceita caminho interno, com query e fragmento', () => {
    expect(safeRedirect('/ava')).toBe('/ava');
    expect(safeRedirect('/loja?pacote=imersao-rh-lancamento')).toBe('/loja?pacote=imersao-rh-lancamento');
    expect(safeRedirect('/cursos/imersao-rh#grade')).toBe('/cursos/imersao-rh#grade');
  });

  it('recusa destino externo ou relativo ao protocolo', () => {
    expect(safeRedirect('https://example.com')).toBeNull();
    expect(safeRedirect('//example.com')).toBeNull();
    expect(safeRedirect('/\\example.com')).toBeNull();
    expect(safeRedirect('javascript:alert(1)')).toBeNull();
  });

  it('recusa o proprio login, vazio e o que nao e texto', () => {
    expect(safeRedirect('/login')).toBeNull();
    expect(safeRedirect('/login?redirect=/ava')).toBeNull();
    expect(safeRedirect('')).toBeNull();
    expect(safeRedirect(null)).toBeNull();
    expect(safeRedirect(undefined)).toBeNull();
    expect(safeRedirect(['/ava'])).toBeNull();
  });
});
