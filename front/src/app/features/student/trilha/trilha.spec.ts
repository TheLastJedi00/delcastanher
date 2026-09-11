import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CourseProgress } from '../../../core/services/progress.service';
import { Trilha } from './trilha';

const PROGRESS_URL = `${environment.apiUrl}/progress/me`;

/**
 * Tres modulos, tres situacoes de video: pronto, ainda processando e sem
 * arquivo nenhum. A trilha precisa distinguir os tres (Spec 010).
 */
const MODULES = [
  {
    id: 'm1',
    order: 1,
    title: 'Fundamentos',
    summary: 'Resumo do modulo 1',
    completed: false,
    hasVideo: true,
    videoReady: true,
  },
  {
    id: 'm2',
    order: 2,
    title: 'Diagnóstico',
    summary: 'Resumo do modulo 2',
    completed: false,
    hasVideo: true,
    videoReady: false,
  },
  {
    id: 'm3',
    order: 3,
    title: 'Recrutamento',
    summary: 'Resumo do modulo 3',
    completed: false,
    hasVideo: false,
    videoReady: false,
  },
];

const PLAYBACK = {
  playbackId: 'pb-1',
  token: 'jwt-curto',
  expiresAt: '2026-09-11T14:00:00.000Z',
};

const MATERIAL = {
  id: 'mat-1',
  fileName: 'Checklist.pdf',
  fileType: 'pdf',
  contentType: 'application/pdf',
  sizeBytes: 850 * 1024,
  order: 0,
  moduleId: 'm1',
  moduleOrder: 1,
  moduleTitle: 'Fundamentos',
  downloadUrl: 'https://storage.googleapis.com/leitura',
  downloadExpiresAt: '2026-09-11T12:15:00.000Z',
};

function progress(completedIds: string[]): CourseProgress {
  const modules = MODULES.map(module => ({
    ...module,
    completed: completedIds.includes(module.id),
  }));
  const completedCount = modules.filter(module => module.completed).length;

  return {
    course: { slug: 'imersao-rh', title: 'Imersão RH Estratégico', workloadHours: null },
    modules,
    completedCount,
    totalCount: modules.length,
    percentage: Math.round((completedCount / modules.length) * 100),
    nextModule: modules.find(module => !module.completed) ?? null,
    completed: completedCount === modules.length,
  };
}

describe('Trilha', () => {
  let fixture: ComponentFixture<Trilha>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const heading = () => el().querySelector('main h2')?.textContent?.trim() ?? '';
  const completeButton = () =>
    Array.from(el().querySelectorAll('button')).find(button =>
      /Marcar como Concluída|Concluída/.test(button.textContent ?? ''),
    ) as HTMLButtonElement | undefined;

  /** `moduleId` nulo simula a rota `/ava/trilha`, sem parametro. */
  const create = async (moduleId: string | null) => {
    await TestBed.configureTestingModule({
      imports: [Trilha],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject({
              get: (key: string) => (key === 'moduleId' ? moduleId : null),
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Trilha);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  };

  /** Requisicoes de conteudo do modulo em foco, na ordem em que a tela as faz. */
  const materialCalls = () => backend.match(req => req.url.endsWith('/materials'));
  const playbackCalls = () => backend.match(req => req.url.endsWith('/playback-token'));

  const respond = (
    body: CourseProgress,
    content: { materials?: unknown[]; playback?: unknown | null } = {},
  ) => {
    backend.expectOne(PROGRESS_URL).flush(body);
    fixture.detectChanges();

    materialCalls().forEach(call => call.flush(content.materials ?? []));

    playbackCalls().forEach(call => {
      const grant = content.playback === undefined ? PLAYBACK : content.playback;

      if (grant === null) {
        // 409 e a resposta da API para video ausente ou ainda processando.
        call.flush({ message: 'em processamento' }, { status: 409, statusText: 'Conflict' });
      } else {
        call.flush(grant);
      }
    });

    fixture.detectChanges();
  };

  afterEach(() => {
    backend.verify();
    TestBed.resetTestingModule();
  });

  it('abre o modulo pedido no deep-link da rota', async () => {
    await create('m3');
    respond(progress(['m1']));

    expect(heading()).toBe('Recrutamento');
  });

  it('sem parametro na rota abre o modulo em aberto do aluno', async () => {
    await create(null);
    respond(progress(['m1']));

    expect(heading()).toBe('Diagnóstico');
  });

  it('cai no primeiro modulo quando o id da rota nao existe', async () => {
    await create('modulo-que-nao-existe');
    respond(progress([]));

    expect(heading()).toBe('Fundamentos');
  });

  it('mostra o progresso vindo da API, e nao um valor fixo', async () => {
    await create(null);
    respond(progress(['m1', 'm2']));

    expect(text()).toContain('67%');
  });

  it('exibe o resumo do modulo vindo do banco', async () => {
    await create('m2');
    respond(progress([]));

    expect(text()).toContain('Resumo do modulo 2');
  });

  it('persiste a conclusao do modulo na API', async () => {
    await create('m1');
    respond(progress([]));

    completeButton()?.click();
    fixture.detectChanges();

    const request = backend.expectOne(`${environment.apiUrl}/progress/me/modules/m1`);

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ completed: true });

    request.flush(progress(['m1']));
    fixture.detectChanges();

    expect(completeButton()?.textContent).toContain('Concluída');
  });

  it('desmarca um modulo ja concluido', async () => {
    await create('m1');
    respond(progress(['m1']));

    completeButton()?.click();
    fixture.detectChanges();

    const request = backend.expectOne(`${environment.apiUrl}/progress/me/modules/m1`);

    expect(request.request.body).toEqual({ completed: false });
    request.flush(progress([]));
  });

  it('oferece o certificado quando a trilha inteira esta concluida', async () => {
    await create('m3');
    respond(progress(['m1', 'm2', 'm3']));

    expect(text()).toContain('Trilha concluída');
    expect(
      Array.from(el().querySelectorAll('a')).some(
        anchor => anchor.getAttribute('href') === '/ava/certificado',
      ),
    ).toBe(true);
  });

  it('mostra o erro da API sem derrubar a tela', async () => {
    await create(null);
    backend
      .expectOne(PROGRESS_URL)
      .flush({ message: 'Falha ao carregar.' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text()).toContain('Falha ao carregar.');
    expect(text()).toContain('Tentar novamente');
  });
it('pede o token de playback uma vez para o modulo em foco', async () => {
    await create('m1');
    backend.expectOne(PROGRESS_URL).flush(progress([]));
    fixture.detectChanges();

    const tokens = playbackCalls();
    expect(tokens.length).toBe(1);
    expect(tokens[0].request.url).toBe(`${environment.apiUrl}/modules/m1/playback-token`);
    tokens[0].flush(PLAYBACK);

    materialCalls().forEach(call => call.flush([]));
    fixture.detectChanges();

    // Recarregar o progresso do mesmo modulo nao pede um segundo token.
    expect(playbackCalls().length).toBe(0);
  });

  it('nao pede token para um modulo sem video', async () => {
    await create('m3');
    respond(progress([]));

    expect(playbackCalls().length).toBe(0);
    expect(text()).toContain('ainda não está disponível');
  });

  it('nao oferece play enquanto o video esta em processamento', async () => {
    await create('m2');
    respond(progress([]), { playback: null });

    expect(text()).toContain('ainda não está disponível');
    // Play que so leva a erro e pior do que play nenhum.
    expect(el().querySelector('button[aria-label^="Reproduzir"]')).toBeNull();
  });

  it('oferece o play quando o token chega', async () => {
    await create('m1');
    respond(progress([]));

    expect(el().querySelector('button[aria-label^="Reproduzir"]')).not.toBeNull();
  });

  it('lista os materiais vindos da API, com a URL assinada', async () => {
    await create('m1');
    respond(progress([]), { materials: [MATERIAL] });

    expect(text()).toContain('Checklist.pdf');
    expect(text()).toContain('850 KB');

    const link = Array.from(el().querySelectorAll('a')).find(
      anchor => anchor.getAttribute('href') === MATERIAL.downloadUrl,
    );
    expect(link).toBeTruthy();
  });

  it('diz quando o modulo ainda nao tem materiais', async () => {
    await create('m1');
    respond(progress([]));

    expect(text()).toContain('Nenhum material complementar');
  });

  it('conclui o modulo ao fim do video, pelo mesmo endpoint do botao', async () => {
    await create('m1');
    respond(progress([]));

    el().querySelector('ui-video-player')!.dispatchEvent(new CustomEvent('ended'));
    fixture.detectChanges();

    const request = backend.expectOne(`${environment.apiUrl}/progress/me/modules/m1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ completed: true });

    request.flush(progress(['m1']));
    fixture.detectChanges();

    expect(completeButton()?.textContent).toContain('Concluída');
  });

  it('nao marca o mesmo modulo duas vezes quando o video termina de novo', async () => {
    await create('m1');
    respond(progress([]));

    const player = el().querySelector('ui-video-player')!;
    player.dispatchEvent(new CustomEvent('ended'));
    fixture.detectChanges();

    backend.expectOne(`${environment.apiUrl}/progress/me/modules/m1`).flush(progress(['m1']));
    fixture.detectChanges();

    player.dispatchEvent(new CustomEvent('ended'));
    fixture.detectChanges();

    // Assistir de novo nao desfaz nem repete a conclusao.
    backend.expectNone(`${environment.apiUrl}/progress/me/modules/m1`);
  });

  it('mantem o botao manual como alternativa quando nao ha video', async () => {
    await create('m3');
    respond(progress([]));

    // Video que nao existe nao pode deixar o aluno preso sem concluir o curso.
    expect(completeButton()).toBeTruthy();
  });
});
