import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ContentService, formatFileSize } from './content.service';

const PLAYBACK_URL = `${environment.apiUrl}/modules/mod-1/playback-token`;

describe('ContentService', () => {
  let service: ContentService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ContentService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  describe('playback', () => {
    it('devolve o token quando o video esta pronto', () => {
      let grant: unknown = undefined;
      service.playback('mod-1').subscribe(value => (grant = value));

      backend.expectOne(PLAYBACK_URL).flush({ playbackId: 'pb-1', token: 'jwt', expiresAt: 'x' });

      expect(grant).toEqual({ playbackId: 'pb-1', token: 'jwt', expiresAt: 'x' });
    });

    it('trata o 409 como estado, e nao como erro', () => {
      let grant: unknown = 'nao chamou';
      service.playback('mod-1').subscribe(value => (grant = value));

      backend
        .expectOne(PLAYBACK_URL)
        .flush({ message: 'em processamento' }, { status: 409, statusText: 'Conflict' });

      expect(grant).toBeNull();
    });

    it('nao repassa ao aluno a mensagem interna de um erro 500', () => {
      let erro = '';
      service.playback('mod-1').subscribe({ error: (message: string) => (erro = message) });

      backend.expectOne(PLAYBACK_URL).flush(
        { message: 'MUX_SIGNING_PRIVATE_KEY nao configurada.' },
        { status: 500, statusText: 'Internal Server Error' },
      );

      // Falha de configuracao do servidor nao e assunto de quem esta assistindo
      // aula: o nome da variavel nao ajuda o aluno e expoe a infraestrutura.
      expect(erro).not.toContain('MUX_SIGNING_PRIVATE_KEY');
      expect(erro).toContain('Tente novamente');
    });
  });

  describe('formatFileSize', () => {
    it('usa MB a partir de um mega', () => {
      expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
    });

    it('usa KB entre um kilo e um mega', () => {
      expect(formatFileSize(850 * 1024)).toBe('850 KB');
    });

    it('mostra bytes abaixo de 1 KB, em vez de arredondar para 0 KB', () => {
      // "0 KB" na tela parece arquivo vazio ou upload corrompido.
      expect(formatFileSize(187)).toBe('187 bytes');
    });

    it('devolve vazio para tamanho ausente', () => {
      expect(formatFileSize(null)).toBe('');
      expect(formatFileSize(0)).toBe('');
    });
  });
});
