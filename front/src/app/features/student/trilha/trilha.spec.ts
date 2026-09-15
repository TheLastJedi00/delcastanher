import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CourseProgress, ProgressLessonItem } from '../../../core/services/progress.service';
import { Trilha } from './trilha';

const PROGRESS_URL = `${environment.apiUrl}/progress/me`;

/**
 * Estrutura da Spec 012: o modulo e container de aulas. O modulo 1 tem duas
 * aulas (uma com video pronto, uma ainda processando), o 2 tem uma sem video e
 * o 3 nao tem aula nenhuma — os quatro casos que a trilha precisa distinguir.
 */
const LESSONS: Record<string, Omit<ProgressLessonItem, 'completed'>[]> = {
  m1: [
    {
      id: 'l1',
      order: 1,
      title: 'O papel do RH',
      summary: 'Resumo da aula 1',
      hasVideo: true,
      videoReady: true,
      durationSeconds: 754,
    },
    {
      id: 'l2',
      order: 2,
      title: 'Maturidade de RH',
      summary: 'Resumo da aula 2',
      hasVideo: true,
      videoReady: false,
      durationSeconds: null,
    },
  ],
  m2: [
    {
      id: 'l3',
      order: 1,
      title: 'Mapeamento de processos',
      summary: 'Resumo da aula 3',
      hasVideo: false,
      videoReady: false,
      durationSeconds: null,
    },
  ],
  m3: [],
};

const MODULES = [
  { id: 'm1', order: 1, title: 'Fundamentos', summary: 'Resumo do modulo 1' },
  { id: 'm2', order: 2, title: 'Diagnóstico', summary: 'Resumo do modulo 2' },
  { id: 'm3', order: 3, title: 'Recrutamento', summary: 'Resumo do modulo 3' },
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
  lessonId: 'l1',
  lessonOrder: 1,
  lessonTitle: 'O papel do RH',
  downloadUrl: 'https://storage.googleapis.com/leitura',
  downloadExpiresAt: '2026-09-11T12:15:00.000Z',
};

/**
 * Progresso como a API o devolve: a conclusao do modulo e **derivada** das
 * aulas, e os contadores de topo contam aulas (decisoes 5 e 6).
 */
function progress(completedLessonIds: string[]): CourseProgress {
  const modules = MODULES.map(module => {
    const lessons = LESSONS[module.id].map(lesson => ({
      ...lesson,
      completed: completedLessonIds.includes(lesson.id),
    }));
    const completedCount = lessons.filter(lesson => lesson.completed).length;

    return {
      ...module,
      lessons,
      completedCount,
      totalCount: lessons.length,
      completed: lessons.length > 0 && completedCount === lessons.length,
      nextLesson: lessons.find(lesson => !lesson.completed) ?? null,
    };
  });

  const allLessons = modules.flatMap(module => module.lessons);
  const completedCount = allLessons.filter(lesson => lesson.completed).length;
  const nextModule = modules.find(module => module.nextLesson !== null) ?? null;

  return {
    course: { slug: 'imersao-rh', title: 'Imersão RH Estratégico', workloadHours: null },
    modules,
    completedCount,
    totalCount: allLessons.length,
    percentage: Math.round((completedCount / allLessons.length) * 100),
    nextModule,
    nextLesson: nextModule?.nextLesson ?? null,
    completed: completedCount === allLessons.length,
  };
}

const MODULE_CERTIFICATE = {
  code: 'DELC-MODU-2345',
  hash: 'a'.repeat(64),
  scope: 'module',
  studentName: 'Aluno Teste',
  courseTitle: 'Imersão RH Estratégico',
  moduleTitle: 'Módulo 1: Fundamentos',
  moduleId: 'm1',
  workloadHours: null,
  issuedAt: '2026-09-11T12:00:00.000Z',
  status: 'ACTIVE',
};

describe('Trilha', () => {
  let fixture: ComponentFixture<Trilha>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const lessonHeading = () => el().querySelector('main h3')?.textContent?.trim() ?? '';
  const completeButton = () =>
    Array.from(el().querySelectorAll('button')).find(button =>
      /Marcar como Concluída|Concluída/.test(button.textContent ?? ''),
    ) as HTMLButtonElement | undefined;
  const trackPills = () =>
    Array.from(el().querySelectorAll('ui-lesson-track button')) as HTMLButtonElement[];

  /** Ids nulos simulam as formas curtas da rota. */
  const create = async (moduleId: string | null, lessonId: string | null = null) => {
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
              get: (key: string) =>
                key === 'moduleId' ? moduleId : key === 'lessonId' ? lessonId : null,
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Trilha);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  };

  /** Requisicoes de conteudo da aula em foco, na ordem em que a tela as faz. */
  const materialCalls = () => backend.match(req => req.url.endsWith('/materials'));
  const playbackCalls = () => backend.match(req => req.url.endsWith('/playback-token'));

  /** Diplomas de modulo: a trilha os carrega para nao oferecer emitir duas vezes. */
  const certificateCalls = () => backend.match(req => req.url.endsWith('/certificates/me/modules'));

  const respond = (
    body: CourseProgress,
    content: { materials?: unknown[]; playback?: unknown | null; certificates?: unknown[] } = {},
  ) => {
    backend.expectOne(PROGRESS_URL).flush(body);
    fixture.detectChanges();

    certificateCalls().forEach(call => call.flush(content.certificates ?? []));
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

  describe('posicao vinda da rota', () => {
    it('abre a aula pedida no deep-link completo', async () => {
      await create('m1', 'l2');
      respond(progress([]), { playback: null });

      expect(lessonHeading()).toBe('Maturidade de RH');
    });

    it('so com o modulo na rota abre a primeira aula em aberto dele', async () => {
      await create('m1');
      respond(progress(['l1']), { playback: null });

      expect(lessonHeading()).toBe('Maturidade de RH');
    });

    it('sem parametro nenhum abre a proxima aula do aluno', async () => {
      await create(null);
      respond(progress(['l1']), { playback: null });

      expect(lessonHeading()).toBe('Maturidade de RH');
    });

    it('cai no primeiro modulo quando o id da rota nao existe', async () => {
      await create('modulo-que-nao-existe');
      respond(progress([]));

      expect(lessonHeading()).toBe('O papel do RH');
    });

    it('ignora uma aula que nao pertence ao modulo da rota', async () => {
      await create('m1', 'l3');
      respond(progress([]));

      // `l3` e do modulo 2: a tela cai na proxima aula do modulo pedido, em vez
      // de misturar as duas coisas ou quebrar.
      expect(lessonHeading()).toBe('O papel do RH');
    });

    it('diz quando o modulo nao tem aula publicada, sem tela quebrada', async () => {
      await create('m3');
      respond(progress([]));

      expect(text()).toContain('ainda não tem aulas publicadas');
      expect(playbackCalls().length).toBe(0);
    });
  });

  describe('trilha horizontal', () => {
    it('enumera as aulas do modulo em foco', async () => {
      await create('m1');
      respond(progress(['l1']));

      const labels = trackPills().map(pill => pill.getAttribute('aria-label'));

      expect(labels).toEqual([
        'Aula 1: O papel do RH, concluída, 13 min',
        'Aula 2: Maturidade de RH, em aberto',
      ]);
    });

    it('marca a aula em foco com aria-current de passo', async () => {
      await create('m1', 'l2');
      respond(progress([]), { playback: null });

      const current = trackPills().filter(pill => pill.getAttribute('aria-current') === 'step');

      expect(current.length).toBe(1);
      expect(current[0].getAttribute('aria-label')).toContain('Aula 2');
    });

    it('mostra quantas aulas do modulo estao concluidas', async () => {
      await create('m1');
      respond(progress(['l1']));

      expect(text()).toContain('1 de 2 aulas');
    });
  });

  describe('progresso', () => {
    it('mostra o percentual vindo da API, contando aulas', async () => {
      await create(null);
      respond(progress(['l1', 'l2']));

      // Duas de tres aulas publicadas.
      expect(text()).toContain('67%');
      expect(text()).toContain('2 de 3 aulas concluídas');
    });

    it('exibe o resumo da aula vindo do banco', async () => {
      await create('m1', 'l1');
      respond(progress([]));

      expect(text()).toContain('Resumo da aula 1');
    });

    it('persiste a conclusao da aula na API', async () => {
      await create('m1', 'l1');
      respond(progress([]));

      completeButton()?.click();
      fixture.detectChanges();

      const request = backend.expectOne(`${environment.apiUrl}/progress/me/lessons/l1`);

      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ completed: true });

      request.flush(progress(['l1']));
      fixture.detectChanges();

      expect(completeButton()?.textContent).toContain('Concluída');
    });

    it('desmarca uma aula ja concluida', async () => {
      await create('m1', 'l1');
      respond(progress(['l1']));

      completeButton()?.click();
      fixture.detectChanges();

      const request = backend.expectOne(`${environment.apiUrl}/progress/me/lessons/l1`);

      expect(request.request.body).toEqual({ completed: false });
      request.flush(progress([]));
    });

    it('oferece o certificado do curso quando todas as aulas estao concluidas', async () => {
      await create('m2', 'l3');
      respond(progress(['l1', 'l2', 'l3']));

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
      certificateCalls().forEach(call => call.flush([]));

      expect(text()).toContain('Falha ao carregar.');
      expect(text()).toContain('Tentar novamente');
    });
  });

  describe('video', () => {
    it('pede o token de playback uma vez para a aula em foco', async () => {
      await create('m1', 'l1');
      backend.expectOne(PROGRESS_URL).flush(progress([]));
      fixture.detectChanges();
      certificateCalls().forEach(call => call.flush([]));

      const tokens = playbackCalls();
      expect(tokens.length).toBe(1);
      expect(tokens[0].request.url).toBe(`${environment.apiUrl}/lessons/l1/playback-token`);
      tokens[0].flush(PLAYBACK);

      materialCalls().forEach(call => call.flush([]));
      fixture.detectChanges();

      // Recarregar o progresso da mesma aula nao pede um segundo token.
      expect(playbackCalls().length).toBe(0);
    });

    it('nao pede token para uma aula sem video', async () => {
      await create('m2', 'l3');
      respond(progress([]));

      expect(playbackCalls().length).toBe(0);
      expect(text()).toContain('ainda não está disponível');
    });

    it('nao oferece play enquanto o video esta em processamento', async () => {
      await create('m1', 'l2');
      respond(progress([]), { playback: null });

      expect(text()).toContain('ainda não está disponível');
      // Play que so leva a erro e pior do que play nenhum.
      expect(el().querySelector('button[aria-label^="Reproduzir"]')).toBeNull();
    });

    it('oferece o play quando o token chega', async () => {
      await create('m1', 'l1');
      respond(progress([]));

      expect(el().querySelector('button[aria-label^="Reproduzir"]')).not.toBeNull();
    });

    it('conclui a aula ao fim do video, pelo mesmo endpoint do botao', async () => {
      await create('m1', 'l1');
      respond(progress([]));

      el().querySelector('ui-video-player')!.dispatchEvent(new CustomEvent('ended'));
      fixture.detectChanges();

      const request = backend.expectOne(`${environment.apiUrl}/progress/me/lessons/l1`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ completed: true });

      request.flush(progress(['l1']));
      fixture.detectChanges();

      expect(completeButton()?.textContent).toContain('Concluída');
    });

    it('nao marca a mesma aula duas vezes quando o video termina de novo', async () => {
      await create('m1', 'l1');
      respond(progress([]));

      const player = el().querySelector('ui-video-player')!;
      player.dispatchEvent(new CustomEvent('ended'));
      fixture.detectChanges();

      backend.expectOne(`${environment.apiUrl}/progress/me/lessons/l1`).flush(progress(['l1']));
      fixture.detectChanges();

      player.dispatchEvent(new CustomEvent('ended'));
      fixture.detectChanges();

      // Assistir de novo nao desfaz nem repete a conclusao.
      expect(backend.match(`${environment.apiUrl}/progress/me/lessons/l1`).length).toBe(0);
    });

    it('nao avanca sozinho para a proxima aula quando o video termina', async () => {
      await create('m1', 'l1');
      respond(progress([]));

      el().querySelector('ui-video-player')!.dispatchEvent(new CustomEvent('ended'));
      fixture.detectChanges();
      backend.expectOne(`${environment.apiUrl}/progress/me/lessons/l1`).flush(progress(['l1']));
      fixture.detectChanges();

      // Concluir revela o botao; quem avanca e o aluno (decisao 12). Nenhum
      // token da aula seguinte e pedido por conta propria.
      expect(text()).toContain('Próxima aula: Maturidade de RH');
      expect(playbackCalls().length).toBe(0);
    });

    it('mantem o botao manual como alternativa quando nao ha video', async () => {
      await create('m2', 'l3');
      respond(progress([]));

      // Video que nao existe nao pode deixar o aluno preso sem concluir o curso.
      expect(completeButton()).toBeTruthy();
    });
  });

  describe('materiais', () => {
    it('lista os materiais da aula, com a URL assinada', async () => {
      await create('m1', 'l1');
      respond(progress([]), { materials: [MATERIAL] });

      expect(text()).toContain('Checklist.pdf');
      expect(text()).toContain('850 KB');

      const link = Array.from(el().querySelectorAll('a')).find(
        anchor => anchor.getAttribute('href') === MATERIAL.downloadUrl,
      );
      expect(link).toBeTruthy();
    });

    it('pede os materiais da aula, e nao do modulo', async () => {
      await create('m1', 'l1');
      backend.expectOne(PROGRESS_URL).flush(progress([]));
      fixture.detectChanges();
      certificateCalls().forEach(call => call.flush([]));

      const calls = materialCalls();
      expect(calls.length).toBe(1);
      expect(calls[0].request.url).toBe(`${environment.apiUrl}/lessons/l1/materials`);
      calls[0].flush([]);

      playbackCalls().forEach(call => call.flush(PLAYBACK));
      fixture.detectChanges();
    });

    it('diz quando a aula ainda nao tem materiais', async () => {
      await create('m1', 'l1');
      respond(progress([]));

      expect(text()).toContain('Nenhum material complementar');
    });
  });

  describe('diploma do modulo', () => {
    it('nao oferece emissao com alguma aula do modulo em aberto', async () => {
      await create('m1', 'l1');
      respond(progress(['l1']));

      // Uma de duas aulas: o diploma do modulo exige o modulo inteiro
      // (decisao 13), e a tela diz quanto falta em vez de oferecer o clique
      // que voltaria em 409.
      expect(text()).toContain('Conclua 2 aulas deste módulo');
      expect(text()).not.toContain('Emitir certificado do módulo');
    });

    it('libera a emissao quando todas as aulas do modulo estao concluidas', async () => {
      await create('m1', 'l1');
      respond(progress(['l1', 'l2']));

      expect(text()).toContain('Certificado deste módulo');
      // A diferenca entre os dois documentos fica explicita na propria tela.
      expect(text()).toContain('não substitui o certificado do curso');

      const botao = Array.from(el().querySelectorAll('button')).find(button =>
        /Emitir certificado do módulo/.test(button.textContent ?? ''),
      ) as HTMLButtonElement;
      botao.click();
      fixture.detectChanges();

      const request = backend.expectOne(`${environment.apiUrl}/certificates/me/modules/m1`);
      expect(request.request.method).toBe('POST');
      request.flush(MODULE_CERTIFICATE);
      fixture.detectChanges();

      expect(text()).toContain('DELC-MODU-2345');
    });

    it('mostra o diploma ja emitido em vez de oferecer emitir de novo', async () => {
      await create('m1', 'l1');
      respond(progress(['l1', 'l2']), { certificates: [MODULE_CERTIFICATE] });

      expect(text()).toContain('DELC-MODU-2345');
      expect(text()).not.toContain('Emitir certificado do módulo');
    });
  });
});
