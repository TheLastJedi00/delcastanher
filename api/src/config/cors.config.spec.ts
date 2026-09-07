import { ConfigService } from '@nestjs/config';
import { DEFAULT_DEV_ORIGIN, corsOrigins } from './cors.config';

/** ConfigService minimo, lendo de um mapa em memoria. */
function configWith(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as ConfigService;
}

describe('corsOrigins', () => {
  describe('leitura de CORS_ORIGINS', () => {
    it('usa a origem unica declarada na variavel', () => {
      const config = configWith({
        CORS_ORIGINS: 'https://delcastanher.vercel.app',
      });

      expect(corsOrigins(config)).toEqual(['https://delcastanher.vercel.app']);
    });

    it('aceita varias origens separadas por virgula', () => {
      const config = configWith({
        CORS_ORIGINS: 'https://delcastanher.vercel.app,http://localhost:4200',
      });

      expect(corsOrigins(config)).toEqual([
        'https://delcastanher.vercel.app',
        'http://localhost:4200',
      ]);
    });

    it('remove os espacos em volta de cada origem', () => {
      const config = configWith({
        CORS_ORIGINS:
          ' https://delcastanher.vercel.app , http://localhost:4200 ',
      });

      expect(corsOrigins(config)).toEqual([
        'https://delcastanher.vercel.app',
        'http://localhost:4200',
      ]);
    });

    it('descarta entradas vazias de virgulas sobrando', () => {
      const config = configWith({
        CORS_ORIGINS: 'https://a.app,,https://b.app,',
      });

      expect(corsOrigins(config)).toEqual(['https://a.app', 'https://b.app']);
    });

    it('descarta origens repetidas', () => {
      const config = configWith({
        CORS_ORIGINS: 'https://a.app,https://a.app',
      });

      expect(corsOrigins(config)).toEqual(['https://a.app']);
    });
  });

  describe('fora de producao', () => {
    it('cai no front local quando a variavel nao existe', () => {
      expect(corsOrigins(configWith({}))).toEqual([DEFAULT_DEV_ORIGIN]);
    });

    it('cai no front local quando a variavel so tem separadores', () => {
      const config = configWith({ CORS_ORIGINS: ' , , ' });

      expect(corsOrigins(config)).toEqual([DEFAULT_DEV_ORIGIN]);
    });
  });

  describe('em producao', () => {
    it('falha com mensagem clara quando a variavel nao esta definida', () => {
      const config = configWith({ NODE_ENV: 'production' });

      expect(() => corsOrigins(config)).toThrow(/CORS_ORIGINS/);
    });

    it('nao cai no localhost silenciosamente', () => {
      const config = configWith({ NODE_ENV: 'production' });

      expect(() => corsOrigins(config)).toThrow();
    });

    it('usa as origens declaradas', () => {
      const config = configWith({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://delcastanher.vercel.app',
      });

      expect(corsOrigins(config)).toEqual(['https://delcastanher.vercel.app']);
    });
  });
});
