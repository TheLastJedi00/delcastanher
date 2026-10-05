import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token';

const SECRET = 'segredo-do-descadastro';

/**
 * Token do link de descadastro (Spec 023, decisao B5): HMAC do `userId`, sem
 * validade e sem login. Quem tem o link e quem recebeu o e-mail.
 */
describe('unsubscribe token', () => {
  it('assina e devolve o mesmo userId na verificacao', () => {
    const token = signUnsubscribeToken('uid-123', SECRET);

    expect(verifyUnsubscribeToken(token, SECRET)).toBe('uid-123');
  });

  it('e deterministico: o mesmo aluno tem sempre o mesmo link', () => {
    expect(signUnsubscribeToken('uid-123', SECRET)).toBe(signUnsubscribeToken('uid-123', SECRET));
  });

  it('serve em URL sem escape', () => {
    expect(signUnsubscribeToken('uid/+=123', SECRET)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('recusa o token com o userId trocado', () => {
    const [, signature] = signUnsubscribeToken('uid-123', SECRET).split('.');
    const forged = `${Buffer.from('uid-outro').toString('base64url')}.${signature}`;

    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it('recusa o token assinado com outro segredo', () => {
    expect(verifyUnsubscribeToken(signUnsubscribeToken('uid-123', 'outro'), SECRET)).toBeNull();
  });

  it('recusa lixo, vazio e ausente sem lancar', () => {
    for (const token of ['', 'abc', 'a.b.c', '.', undefined, null]) {
      expect(verifyUnsubscribeToken(token as string, SECRET)).toBeNull();
    }
  });
});
