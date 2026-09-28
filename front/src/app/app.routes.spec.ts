import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { signInForTest } from './core/testing/session';

const ME = `${environment.apiUrl}/users/me`;
const CATALOG = `${environment.apiUrl}/store/catalog`;

const PROFILE = {
  id: 'uid-123',
  email: 'pessoa@delcastanher.com',
  name: 'Pessoa',
  bio: 'Bio.',
  phone: '(11) 90000-0000',
  linkedin: null,
  onboardingCompleted: true,
  policyAcceptedAt: null,
  policyAcceptedVersion: null,
};

/** Catalogo de quem ainda nao comprou nada. */
const LOCKED = [
  {
    id: 'm1',
    order: 1,
    title: 'Fundamentos do RH Estratégico',
    summary: 'Resumo.',
    lessonCount: 1,
    priceCents: 19700,
    purchasable: true,
    access: { unlocked: false, expiresAt: null },
  },
];

/**
 * Responde as requisicoes que a navegacao dispara, na ordem em que aparecem,
 * ate a navegacao terminar. Guards e componentes lazy fazem chamadas em
 * sequencia, e esperar por cada uma no teste amarraria o teste a ordem delas.
 */
async function navigate(url: string): Promise<void> {
  const harness = await RouterTestingHarness.create();
  const backend = TestBed.inject(HttpTestingController);
  let done = false;

  const navigation = harness.navigateByUrl(url).finally(() => (done = true));

  for (let round = 0; round < 50 && !done; round += 1) {
    await new Promise(resolve => setTimeout(resolve));

    for (const request of backend.match(() => true)) {
      if (request.request.url === ME) {
        request.flush(PROFILE);
      } else if (request.request.url === CATALOG) {
        request.flush(LOCKED);
      } else {
        request.flush({});
      }
    }
  }

  await navigation;
  harness.detectChanges();
}

/**
 * Spec 019, decisao 15. A loja passou a morar no shell do AVA, e o `authGuard`
 * decide o papel pelo `path` da rota. Se a arvore nova fizer o guard enxergar
 * outro `path`, o aluno sem acesso volta ao laco `/ava` -> `/loja` da Spec 014 —
 * e este teste falha por excesso de redirecionamentos em vez de chegar a loja.
 */
describe('rotas da area do aluno', () => {
  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('leva o aluno sem acesso do /ava para a loja, dentro do shell, sem laco', async () => {
    signInForTest('aluno');

    await navigate('/ava');

    expect(TestBed.inject(Router).url).toBe('/loja');
    expect(document.querySelector('app-student-layout ui-sidebar')).not.toBeNull();
    expect(document.querySelector('app-student-layout app-loja')).not.toBeNull();
  });
});
