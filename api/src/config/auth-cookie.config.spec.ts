import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_REFRESH_COOKIE_MAX_AGE_DAYS,
  REFRESH_COOKIE,
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from './auth-cookie.config';

/** ConfigService minimo, lendo de um mapa em memoria. */
function configWith(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as ConfigService;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cookie do refresh token (Spec 017, decisoes 12 e 15).
 *
 * Gravar e apagar precisam usar os mesmos atributos: o navegador so remove um
 * cookie quando nome, `Path` e `Domain` batem com os de quem o gravou.
 */
describe('cookie do refresh token', () => {
  it('usa o prefixo __Secure-, que o navegador so aceita com Secure', () => {
    expect(REFRESH_COOKIE).toBe('__Secure-refresh');
  });

  it('grava HttpOnly, Secure, SameSite=Strict e Path=/auth, sem Domain', () => {
    const options = refreshCookieOptions(configWith({}));

    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' });
    expect(options).not.toHaveProperty('domain');
  });

  it('dura 30 dias quando AUTH_REFRESH_COOKIE_MAX_AGE_DAYS nao esta definida', () => {
    expect(DEFAULT_REFRESH_COOKIE_MAX_AGE_DAYS).toBe(30);
    expect(refreshCookieOptions(configWith({})).maxAge).toBe(30 * DAY_MS);
  });

  it('le a duracao em dias da variavel de ambiente', () => {
    expect(refreshCookieOptions(configWith({ AUTH_REFRESH_COOKIE_MAX_AGE_DAYS: '7' })).maxAge).toBe(7 * DAY_MS);
  });

  it.each(['abc', '0', '-3', '1.5', ''])('recusa a duracao invalida "%s" em vez de cair no default', value => {
    const config = configWith({ AUTH_REFRESH_COOKIE_MAX_AGE_DAYS: value });

    if (value === '') {
      // Variavel declarada vazia e o mesmo que ausente.
      expect(refreshCookieOptions(config).maxAge).toBe(30 * DAY_MS);
    } else {
      expect(() => refreshCookieOptions(config)).toThrow(/AUTH_REFRESH_COOKIE_MAX_AGE_DAYS/);
    }
  });

  it('apaga com os mesmos atributos com que grava, sem maxAge', () => {
    const { maxAge, ...written } = refreshCookieOptions(configWith({}));

    expect(maxAge).toBeGreaterThan(0);
    expect(clearRefreshCookieOptions()).toEqual(written);
  });
});
