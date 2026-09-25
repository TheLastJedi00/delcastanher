import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { TokenCipher } from './token-cipher';

const KEY = randomBytes(32).toString('base64');

function cipherWith(key: string | undefined): TokenCipher {
  const config = { get: jest.fn((name: string) => (name === 'MP_TOKEN_ENCRYPTION_KEY' ? key : undefined)) };

  return new TokenCipher(config as unknown as ConfigService);
}

describe('TokenCipher (Spec 020, decisao 4)', () => {
  it('devolve o valor original ao decifrar o que cifrou', () => {
    const cipher = cipherWith(KEY);

    expect(cipher.decrypt(cipher.encrypt('APP_USR-123-token'))).toBe('APP_USR-123-token');
  });

  it('nao grava o token em claro', () => {
    const cipher = cipherWith(KEY);

    expect(cipher.encrypt('APP_USR-123-token')).not.toContain('APP_USR-123-token');
  });

  // IV aleatorio por valor: dois cifrados iguais diriam a quem le o banco que
  // os dois tokens sao o mesmo.
  it('produz cifrados diferentes para o mesmo valor', () => {
    const cipher = cipherWith(KEY);

    expect(cipher.encrypt('mesmo-token')).not.toBe(cipher.encrypt('mesmo-token'));
  });

  // GCM autentica: um byte trocado no banco precisa virar erro, e nao um token
  // quase certo mandado ao Mercado Pago.
  it('recusa cifrado adulterado', () => {
    const cipher = cipherWith(KEY);
    const encrypted = cipher.encrypt('APP_USR-123-token');
    const parts = encrypted.split('.');
    const body = Buffer.from(parts[3], 'base64');
    body[0] = body[0] ^ 0xff;
    parts[3] = body.toString('base64');

    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });

  it('recusa decifrar com outra chave', () => {
    const encrypted = cipherWith(KEY).encrypt('APP_USR-123-token');

    expect(() => cipherWith(randomBytes(32).toString('base64')).decrypt(encrypted)).toThrow();
  });

  it('recusa formato desconhecido', () => {
    expect(() => cipherWith(KEY).decrypt('texto-qualquer')).toThrow();
  });

  it('recusa chave ausente, com o nome da variavel', () => {
    expect(() => cipherWith(undefined).encrypt('x')).toThrow(/MP_TOKEN_ENCRYPTION_KEY/);
  });

  // Uma chave curta daria um AES mais fraco que o pretendido, ou nenhum: o
  // tamanho e conferido antes de qualquer uso.
  it('recusa chave que nao tem 32 bytes', () => {
    expect(() => cipherWith(randomBytes(16).toString('base64')).encrypt('x')).toThrow(
      /32 bytes/,
    );
  });
});
