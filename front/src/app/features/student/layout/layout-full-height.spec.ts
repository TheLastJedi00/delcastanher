import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FULL_HEIGHT_DATA_KEY } from '../../../core/services/layout-route';
import { StudentLayout } from './layout';

@Component({ selector: 'app-stub', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class Stub {}

/**
 * O shell do AVA serve dois modelos de conteudo: a trilha ocupa a altura util
 * e rola por dentro; as demais telas crescem com o conteudo e rolam por fora.
 *
 * Quando o shell travava a altura em todas as rotas, qualquer pagina mais alta
 * que a area util vazava da propria caixa e passava por cima do rodape de
 * links legais — que aparecia encalhado no meio dos cards do hub.
 *
 * Este arquivo fica separado do `layout.spec.ts` de proposito: aquele nasce em
 * outro PR, e dois arquivos novos no mesmo caminho colidiriam no merge.
 */
describe('StudentLayout — altura por rota', () => {
  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'ava',
            component: StudentLayout,
            children: [
              { path: '', component: Stub },
              { path: 'trilha', data: { [FULL_HEIGHT_DATA_KEY]: true }, component: Stub },
            ],
          },
        ]),
      ],
    });
  });

  afterEach(() => localStorage.clear());

  /** O `div` que embrulha o `router-outlet` dentro do `main`. */
  function wrapperClasses(harness: RouterTestingHarness): string {
    const wrapper = harness.fixture.nativeElement.querySelector('main > div') as HTMLElement;

    expect(wrapper).withContext('o wrapper do router-outlet precisa existir').toBeTruthy();

    return wrapper.className;
  }

  it('nao trava a altura nas paginas de fluxo normal', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ava');

    const classes = wrapperClasses(harness);

    // Com `flex-1 min-h-0` o wrapper e limitado ao espaco que sobra e o
    // conteudo vaza por cima do rodape legal.
    expect(classes).not.toContain('min-h-0');
    expect(classes).not.toContain('flex-1');
  });

  it('trava a altura na trilha, que rola por dentro', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ava/trilha');

    const classes = wrapperClasses(harness);

    expect(classes).toContain('min-h-0');
    expect(classes).toContain('flex-1');
  });

  it('volta a soltar a altura ao sair da trilha', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ava/trilha');
    expect(wrapperClasses(harness)).toContain('flex-1');

    await harness.navigateByUrl('/ava');

    expect(wrapperClasses(harness)).not.toContain('flex-1');
  });

  it('mantem o rodape legal depois do conteudo, nunca sobreposto', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ava');

    const main = harness.fixture.nativeElement.querySelector('main') as HTMLElement;
    const filhos = [...main.children].map(el => el.tagName.toLowerCase());

    // O rodape e o ultimo filho do main: se o wrapper nao trava a altura, o
    // conteudo empurra os links para baixo em vez de passar por cima.
    expect(filhos[filhos.length - 1]).toBe('ui-legal-links');
  });
});
