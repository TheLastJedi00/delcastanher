import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  muxCredentials,
  muxSigningKey,
  muxWebhookSecret,
  optionalEnv,
  requiredEnv,
  storageBucket,
} from './media.config';

function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('media.config', () => {
  it('devolve nulo para variavel ausente ou so com espacos', () => {
    const config = configWith({ FIREBASE_STORAGE_BUCKET: '   ' });

    expect(optionalEnv(config, 'FIREBASE_STORAGE_BUCKET')).toBeNull();
    expect(optionalEnv(config, 'NAO_EXISTE')).toBeNull();
  });

  it('nomeia a variavel que falta quando ela e obrigatoria', () => {
    expect(() => requiredEnv(configWith({}), 'MUX_WEBHOOK_SECRET')).toThrow(
      /MUX_WEBHOOK_SECRET/,
    );
    expect(() => muxWebhookSecret(configWith({}))).toThrow(InternalServerErrorException);
  });

  describe('storageBucket', () => {
    it('aceita o nome cru do bucket', () => {
      const config = configWith({ FIREBASE_STORAGE_BUCKET: 'delcastanher.firebasestorage.app' });

      expect(storageBucket(config)).toBe('delcastanher.firebasestorage.app');
    });

    it('remove o prefixo gs://, que o Admin SDK nao aceita', () => {
      const config = configWith({
        FIREBASE_STORAGE_BUCKET: 'gs://delcastanher.firebasestorage.app/',
      });

      expect(storageBucket(config)).toBe('delcastanher.firebasestorage.app');
    });
  });

  describe('mux', () => {
    it('le as credenciais pelos nomes da spec', () => {
      const config = configWith({ MUX_TOKEN_ID: 'id', MUX_TOKEN_SECRET: 'segredo' });

      expect(muxCredentials(config)).toEqual({ tokenId: 'id', tokenSecret: 'segredo' });
    });

    it('aceita os nomes prefixados pela integracao Mux da Vercel', () => {
      const config = configWith({
        MUX_VIDEO_MUX_TOKEN_ID: 'id-vercel',
        MUX_VIDEO_MUX_TOKEN_SECRET: 'segredo-vercel',
      });

      expect(muxCredentials(config)).toEqual({
        tokenId: 'id-vercel',
        tokenSecret: 'segredo-vercel',
      });
    });

    it('da precedencia ao nome da spec quando os dois existem', () => {
      const config = configWith({ MUX_TOKEN_ID: 'proprio', MUX_VIDEO_MUX_TOKEN_ID: 'vercel' });

      expect(optionalEnv(config, 'MUX_TOKEN_ID')).toBe('proprio');
    });

    it('aceita os nomes que a integracao da Vercel usa para a chave de assinatura', () => {
      const pem = '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----';
      // A chave nao segue o prefixo das demais: chega como MUX_VIDEO_KEY_ID e
      // MUX_VIDEO_SECRET_KEY, sem o segundo "MUX_".
      const config = configWith({
        MUX_VIDEO_KEY_ID: 'key-vercel',
        MUX_VIDEO_SECRET_KEY: Buffer.from(pem, 'utf8').toString('base64'),
      });

      expect(muxSigningKey(config)).toEqual({ keyId: 'key-vercel', privateKey: pem });
    });

    it('decodifica a chave privada de assinatura entregue em base64', () => {
      const pem = '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----';
      const config = configWith({
        MUX_SIGNING_KEY_ID: 'key-1',
        MUX_SIGNING_PRIVATE_KEY: Buffer.from(pem, 'utf8').toString('base64'),
      });

      expect(muxSigningKey(config)).toEqual({ keyId: 'key-1', privateKey: pem });
    });

    it('aceita a chave privada colada como PEM, com \n escapado', () => {
      const config = configWith({
        MUX_SIGNING_KEY_ID: 'key-1',
        MUX_SIGNING_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----',
      });

      expect(muxSigningKey(config).privateKey).toContain('\n');
    });
  });
});
