import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AdminAulas } from './admin-aulas';

const MODULES = [
  {
    id: 'mod-1',
    order: 1,
    title: 'Fundamentos',
    summary: 'Resumo 1',
    priceCents: 19900,
    lessonCount: 2,
    certificateCount: 3,
  },
  {
    id: 'mod-2',
    order: 2,
    title: 'Diagnóstico',
    summary: 'Resumo 2',
    priceCents: null,
    lessonCount: 0,
    certificateCount: 0,
  },
];

const SEM_VIDEO = {
  lessonId: 'les-1',
  hasVideo: false,
  status: null,
  playbackId: null,
  fileName: null,
  sizeBytes: null,
  error: null,
  durationSeconds: null,
};

const LESSONS = [
  {
    id: 'les-1',
    moduleId: 'mod-1',
    order: 1,
    title: 'O papel do RH',
    summary: 'Resumo da aula 1',
    video: SEM_VIDEO,
    materialCount: 0,
    completedBy: 4,
  },
  {
    id: 'les-2',
    moduleId: 'mod-1',
    order: 2,
    title: 'Maturidade de RH',
    summary: 'Resumo da aula 2',
    video: { ...SEM_VIDEO, lessonId: 'les-2' },
    materialCount: 1,
    completedBy: 0,
  },
];

const MODULES_URL = `${environment.apiUrl}/admin/modules`;
const LESSONS_URL = `${environment.apiUrl}/admin/modules/mod-1/lessons`;
const VIDEO_URL = `${environment.apiUrl}/admin/lessons/les-1/video`;
const MATERIALS_URL = `${environment.apiUrl}/admin/lessons/les-1/materials`;
const BUCKET_URL = 'https://storage.googleapis.com/assinada';

const TICKET = {
  storagePath: 'lessons/les-1/video/aula-01.mp4',
  uploadUrl: BUCKET_URL,
  headers: { 'Content-Type': 'video/mp4' },
  expiresAt: '2026-09-11T12:00:00.000Z',
};

const MATERIAL = {
  id: 'mat-1',
  fileName: 'Checklist.pdf',
  fileType: 'pdf',
  contentType: 'application/pdf',
  sizeBytes: 850 * 1024,
  order: 0,
  moduleId: 'mod-1',
  moduleOrder: 1,
  moduleTitle: 'Fundamentos',
  lessonId: 'les-1',
  lessonOrder: 1,
  lessonTitle: 'O papel do RH',
  downloadUrl: 'https://storage.googleapis.com/leitura',
  downloadExpiresAt: '2026-09-11T12:15:00.000Z',
};

/**
 * Carga inicial dos tres niveis: a grade, as aulas do primeiro modulo e o
 * conteudo da primeira aula.
 */
function bootstrap(
  backend: HttpTestingController,
  fixture: ComponentFixture<AdminAulas>,
  materials: unknown[] = [],
) {
  backend.expectOne(MODULES_URL).flush(MODULES);
  backend.expectOne(LESSONS_URL).flush(LESSONS);
  backend.expectOne(VIDEO_URL).flush(SEM_VIDEO);
  backend.expectOne(MATERIALS_URL).flush(materials);
  fixture.detectChanges();
}

describe('AdminAulas', () => {
  let fixture: ComponentFixture<AdminAulas>;
  let backend: HttpTestingController;

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const buttonWith = (pattern: RegExp) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(button =>
      pattern.test(button.textContent ?? ''),
    ) as HTMLButtonElement | undefined;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminAulas],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminAulas);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => backend.verify());

  describe('grade', () => {
    it('carrega a grade e ja abre o primeiro modulo e a primeira aula', () => {
      bootstrap(backend, fixture);

      expect(text()).toContain('Fundamentos');
      expect(text()).toContain('2 aula(s)');
      expect(text()).toContain('Aulas do módulo 1');
      expect(text()).toContain('O papel do RH');
    });

    it('diz que modulo nao se exclui por aqui', () => {
      bootstrap(backend, fixture);

      // Decisao 15: modulo com diploma emitido nao e removivel, e a tela
      // explica em vez de esconder a ausencia do botao.
      expect(text()).toContain('Módulos não são excluídos por aqui');
      expect(text()).toContain('3 diploma(s) emitido(s)');
      expect(buttonWith(/Remover módulo/)).toBeUndefined();
    });

    it('cria um modulo no fim da grade', () => {
      bootstrap(backend, fixture);

      buttonWith(/Novo módulo/)!.click();
      fixture.detectChanges();

      const form = (fixture.nativeElement as HTMLElement).querySelector('form')!;
      const inputs = form.querySelectorAll('input');
      (inputs[0] as HTMLInputElement).value = 'Módulo novo';
      inputs[0].dispatchEvent(new Event('input'));
      (inputs[1] as HTMLInputElement).value = 'Resumo do módulo novo';
      inputs[1].dispatchEvent(new Event('input'));
      fixture.detectChanges();

      form.dispatchEvent(new Event('submit'));

      const call = backend.expectOne(MODULES_URL);
      expect(call.request.method).toBe('POST');
      expect(call.request.body).toEqual({
        title: 'Módulo novo',
        summary: 'Resumo do módulo novo',
      });
      call.flush({
        id: 'mod-3',
        order: 3,
        title: 'Módulo novo',
        summary: 'Resumo do módulo novo',
        lessonCount: 0,
        certificateCount: 0,
      });
      fixture.detectChanges();

      // Selecionar o modulo recem-criado carrega as aulas dele (nenhuma).
      backend.expectOne(`${environment.apiUrl}/admin/modules/mod-3/lessons`).flush([]);
      fixture.detectChanges();

      expect(text()).toContain('Módulo novo');
    });

    it('reordena a grade mandando a lista completa de ids', () => {
      bootstrap(backend, fixture);

      const descer = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ).find(button => button.textContent?.trim() === '↓')!;
      descer.click();

      const call = backend.expectOne(`${environment.apiUrl}/admin/course/modules/order`);
      expect(call.request.body).toEqual({ ids: ['mod-2', 'mod-1'] });
      call.flush(null);
    });
  });


  /**
   * Preco do modulo (Spec 014, decisao 1 e task 8.5).
   *
   * O primeiro teste e uma REGRESSAO encontrada no teste funcional: o `<form>`
   * do preco nao tinha `[formGroup]`, entao nenhuma diretiva do Angular se
   * prendia a ele, o `(ngSubmit)` virava um listener de `submit` nativo sem
   * `preventDefault`, e salvar RECARREGAVA a pagina — perdendo a aba aberta e
   * sem gravar nada.
   */
  describe('preco do modulo', () => {
    /** O rotulo do botao vem com espaco em volta; ancorar sem `\s` nao casa. */
    const BOTAO_PRECO = /^\s*Preço\s*$/;

    function abrirPreco(): HTMLFormElement {
      bootstrap(backend, fixture);
      buttonWith(BOTAO_PRECO)?.click();
      fixture.detectChanges();

      return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('form')).find(f =>
        f.querySelector('input[id^="preco-"]'),
      ) as HTMLFormElement;
    }

    it('impede o submit nativo, que recarregaria a pagina', () => {
      bootstrap(backend, fixture);
      buttonWith(BOTAO_PRECO)?.click();
      fixture.detectChanges();

      const precoForm = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('form'),
      ).find(f => f.querySelector('input[id^="preco-"]')) as HTMLFormElement;

      expect(precoForm).withContext('formulario de preco aberto').toBeTruthy();

      const evento = new Event('submit', { bubbles: true, cancelable: true });
      precoForm.dispatchEvent(evento);

      // `defaultPrevented` falso significa navegacao do navegador: e
      // exatamente o bug que esta suite existe para nao deixar voltar.
      expect(evento.defaultPrevented).toBe(true);

      // Duas passadas: a primeira responde o PATCH, que por sua vez dispara o
      // recarregamento da grade — e ele ficaria pendente no `verify`.
      backend.match(() => true).forEach(request => request.flush({}));
      backend.match(() => true).forEach(request => request.flush([]));
    });

    it('exibe o preco de cada modulo, e "a definir" para o que nao tem', () => {
      bootstrap(backend, fixture);

      // `toLocaleString` separa o simbolo com espaco NAO separavel: comparar com
      // um espaco comum falharia por um caractere invisivel.
      expect(text()).toContain('199,00');
      expect(text()).toContain('Preço a definir');
    });

    it('converte o texto digitado em centavos ao salvar', () => {
      const precoForm = abrirPreco();
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        'input[id^="preco-"]',
      ) as HTMLInputElement;

      input.value = '249,90';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      buttonWith(/Salvar preço/)?.click();

      const request = backend.expectOne(`${environment.apiUrl}/admin/modules/mod-1/price`);

      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ priceCents: 24990 });

      request.flush({ ...MODULES[0], priceCents: 24990 });
      backend.match(() => true).forEach(pendente => pendente.flush([]));
    });

    // Decisao 1: vazio e "a definir", e nao "de graca". O modulo sai da loja.
    it('envia nulo quando o campo fica vazio', () => {
      abrirPreco();

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        'input[id^="preco-"]',
      ) as HTMLInputElement;

      input.value = '';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      buttonWith(/Salvar preço/)?.click();

      const request = backend.expectOne(`${environment.apiUrl}/admin/modules/mod-1/price`);

      expect(request.request.body).toEqual({ priceCents: null });

      request.flush({ ...MODULES[0], priceCents: null });
      backend.match(() => true).forEach(pendente => pendente.flush([]));
    });
  });
  describe('aulas', () => {
    it('lista as aulas com os numeros que a remocao precisa', () => {
      bootstrap(backend, fixture);

      expect(text()).toContain('4 aluno(s) concluíram');
      expect(text()).toContain('1 material(is)');
    });

    it('cria uma aula no modulo aberto', () => {
      bootstrap(backend, fixture);

      buttonWith(/Nova aula/)!.click();
      fixture.detectChanges();

      const forms = (fixture.nativeElement as HTMLElement).querySelectorAll('form');
      const form = forms[forms.length - 1];
      const inputs = form.querySelectorAll('input');
      (inputs[0] as HTMLInputElement).value = 'Aula nova';
      inputs[0].dispatchEvent(new Event('input'));
      (inputs[1] as HTMLInputElement).value = 'Resumo da aula nova';
      inputs[1].dispatchEvent(new Event('input'));
      fixture.detectChanges();

      form.dispatchEvent(new Event('submit'));

      const call = backend.expectOne(LESSONS_URL);
      expect(call.request.method).toBe('POST');
      // A ordem nao vai no corpo: a aula nasce no fim da lista, no servidor.
      expect(call.request.body).toEqual({
        title: 'Aula nova',
        summary: 'Resumo da aula nova',
      });
      call.flush({
        id: 'les-3',
        moduleId: 'mod-1',
        order: 3,
        title: 'Aula nova',
        summary: 'Resumo da aula nova',
        video: { ...SEM_VIDEO, lessonId: 'les-3' },
        materialCount: 0,
        completedBy: 0,
      });
      fixture.detectChanges();

      // A aula recem-criada vira a selecionada, e o conteudo dela e carregado.
      backend.expectOne(`${environment.apiUrl}/admin/lessons/les-3/video`).flush({
        ...SEM_VIDEO,
        lessonId: 'les-3',
      });
      backend.expectOne(`${environment.apiUrl}/admin/lessons/les-3/materials`).flush([]);
      fixture.detectChanges();

      expect(text()).toContain('Aula nova');
    });

    it('nao cria aula com titulo curto: o formulario nem chama a API', () => {
      bootstrap(backend, fixture);

      buttonWith(/Nova aula/)!.click();
      fixture.detectChanges();

      const forms = (fixture.nativeElement as HTMLElement).querySelectorAll('form');
      const form = forms[forms.length - 1];
      const inputs = form.querySelectorAll('input');
      (inputs[0] as HTMLInputElement).value = 'x';
      inputs[0].dispatchEvent(new Event('input'));
      fixture.detectChanges();

      form.dispatchEvent(new Event('submit'));

      backend.expectNone(LESSONS_URL);
      // O formulario continua aberto, esperando um titulo valido.
      expect(text()).toContain('Criar aula');
    });

    it('renomeia a aula sem reenviar o resumo inteiro do zero', () => {
      bootstrap(backend, fixture);

      const renomear = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ).filter(button => /Renomear/.test(button.textContent ?? ''));

      // Os dois primeiros sao dos modulos; os seguintes, das aulas.
      renomear[MODULES.length].click();
      fixture.detectChanges();

      const forms = (fixture.nativeElement as HTMLElement).querySelectorAll('form');
      const form = forms[forms.length - 1];
      const inputs = form.querySelectorAll('input');
      expect((inputs[0] as HTMLInputElement).value).toBe('O papel do RH');

      (inputs[0] as HTMLInputElement).value = 'Outro título';
      inputs[0].dispatchEvent(new Event('input'));
      fixture.detectChanges();
      form.dispatchEvent(new Event('submit'));

      const call = backend.expectOne(`${environment.apiUrl}/admin/lessons/les-1`);
      expect(call.request.method).toBe('PATCH');
      expect(call.request.body).toEqual({
        title: 'Outro título',
        summary: 'Resumo da aula 1',
      });
      call.flush({ ...LESSONS[0], title: 'Outro título' });
      fixture.detectChanges();

      expect(text()).toContain('Outro título');
    });

    it('reordena as aulas mandando a lista completa de ids', () => {
      bootstrap(backend, fixture);

      const descer = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ).filter(button => button.textContent?.trim() === '↓');

      // As duas primeiras setas sao dos modulos; a terceira e a da aula 1 (a
      // da ultima aula esta desabilitada, como a do ultimo modulo).
      descer[2].click();

      const call = backend.expectOne(`${LESSONS_URL}/order`);
      expect(call.request.body).toEqual({ ids: ['les-2', 'les-1'] });
      call.flush(null);
    });

    it('avisa quantos alunos perdem progresso antes de remover a aula', () => {
      bootstrap(backend, fixture);

      const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
      buttonWith(/^\s*Remover\s*$/)!.click();

      expect(confirmSpy).toHaveBeenCalled();
      expect(confirmSpy.calls.mostRecent().args[0]).toContain('4 aluno(s)');
      // Recusar a confirmacao nao apaga nada.
      backend.expectNone(`${environment.apiUrl}/admin/lessons/les-1`);
    });

    it('remove a aula quando a confirmacao e aceita', () => {
      bootstrap(backend, fixture);

      spyOn(window, 'confirm').and.returnValue(true);
      buttonWith(/^\s*Remover\s*$/)!.click();

      const call = backend.expectOne(`${environment.apiUrl}/admin/lessons/les-1`);
      expect(call.request.method).toBe('DELETE');
      call.flush(null);
      fixture.detectChanges();

      expect(text()).not.toContain('O papel do RH');
    });
  });

  describe('conteudo da aula', () => {
    it('diz que a aula ainda nao tem video', () => {
      bootstrap(backend, fixture);

      expect(text()).toContain('Nenhum vídeo enviado para esta aula');
    });

    it('mostra o estado do processamento vindo da API', () => {
      backend.expectOne(MODULES_URL).flush(MODULES);
      backend.expectOne(LESSONS_URL).flush(LESSONS);
      backend.expectOne(VIDEO_URL).flush({
        ...SEM_VIDEO,
        hasVideo: true,
        status: 'READY',
        fileName: 'aula-01.mp4',
        sizeBytes: 900 * 1024,
        durationSeconds: 754,
      });
      backend.expectOne(MATERIALS_URL).flush([]);
      fixture.detectChanges();

      expect(text()).toContain('Pronto');
      expect(text()).toContain('aula-01.mp4');
      expect(text()).toContain('13 min');
    });

    it('exibe a mensagem de erro quando a ingestao falha', () => {
      backend.expectOne(MODULES_URL).flush(MODULES);
      backend.expectOne(LESSONS_URL).flush(LESSONS);
      backend.expectOne(VIDEO_URL).flush({
        ...SEM_VIDEO,
        hasVideo: true,
        status: 'ERRORED',
        fileName: 'aula-01.mp4',
        error: 'Formato não suportado',
      });
      backend.expectOne(MATERIALS_URL).flush([]);
      fixture.detectChanges();

      expect(text()).toContain('Formato não suportado');
    });

    it('envia o video da aula em tres passos e mostra o progresso', () => {
      bootstrap(backend, fixture);

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        'input[type="file"][accept="video/*"]',
      ) as HTMLInputElement;
      const file = new File(['video'], 'aula-01.mp4', { type: 'video/mp4' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));

      backend.expectOne(`${VIDEO_URL}/upload-url`).flush(TICKET);

      const put = backend.expectOne(BUCKET_URL);
      put.event({ type: HttpEventType.UploadProgress, loaded: 3, total: 4 });
      fixture.detectChanges();

      const barra = (fixture.nativeElement as HTMLElement).querySelector(
        '[role="progressbar"]',
      ) as HTMLElement;
      expect(barra.getAttribute('aria-valuenow')).toBe('75');

      put.flush('');
      backend.expectOne(VIDEO_URL).flush({
        ...SEM_VIDEO,
        hasVideo: true,
        status: 'PROCESSING',
        fileName: 'aula-01.mp4',
      });
      fixture.detectChanges();

      expect(text()).toContain('Processando');
    });

    it('nao confirma na API quando o PUT no bucket falha', () => {
      bootstrap(backend, fixture);

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        'input[type="file"][accept="video/*"]',
      ) as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: [new File(['v'], 'aula.mp4', { type: 'video/mp4' })],
        configurable: true,
      });
      input.dispatchEvent(new Event('change'));

      backend.expectOne(`${VIDEO_URL}/upload-url`).flush(TICKET);
      backend.expectOne(BUCKET_URL).flush('', { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();

      // Nada e gravado: nao ha POST de confirmacao.
      backend.expectNone(VIDEO_URL);
      expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();
    });

    it('lista os materiais da aula', () => {
      bootstrap(backend, fixture, [MATERIAL]);

      expect(text()).toContain('Checklist.pdf');
      expect(text()).toContain('850 KB');
    });

    it('pede confirmacao antes de remover um material', () => {
      bootstrap(backend, fixture, [MATERIAL]);

      spyOn(window, 'confirm').and.returnValue(false);
      buttonWith(/^\s*Remover\s*$/)!.click();

      // O arquivo sai do bucket e nao volta: recusar a confirmacao nao apaga nada.
      backend.expectNone(`${environment.apiUrl}/admin/materials/mat-1`);
    });
  });

  it('bloqueia o papel aluno com a mensagem do backend', () => {
    backend.expectOne(MODULES_URL).flush(
      { message: 'Esta area e restrita a administradores.' },
      { status: 403, statusText: 'Forbidden' },
    );
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')!.textContent,
    ).toContain('administradores');
  });
});
