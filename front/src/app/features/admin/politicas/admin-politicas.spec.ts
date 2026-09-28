import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import {
  AdminLegalDocumentsResult,
  AdminLegalService,
  LegalDocumentVersion,
} from '../../../core/services/admin-legal.service';
import { AdminPoliticas } from './admin-politicas';

const PRIVACY_V1: LegalDocumentVersion = {
  id: 'p1',
  kind: 'PRIVACY',
  content: '## 1. Objetivo\n\nTexto publicado da privacidade.',
  policyVersion: '2026-09-13',
  changeKind: 'INITIAL',
  publishedAt: '2026-09-13T15:00:00.000Z',
  publishedByEmail: null,
};

const PRIVACY_V2: LegalDocumentVersion = {
  ...PRIVACY_V1,
  id: 'p2',
  content: '## 1. Objetivo\n\nTexto corrigido.',
  changeKind: 'CORRECTION',
  publishedAt: '2026-09-20T15:00:00.000Z',
  publishedByEmail: 'lidiane@delcastanher.srv.br',
};

const COOKIES_V1: LegalDocumentVersion = {
  ...PRIVACY_V1,
  id: 'c1',
  kind: 'COOKIES',
  content: '## 1. O que são cookies\n\nTexto publicado dos cookies.',
};

const RESULT: AdminLegalDocumentsResult = {
  policyVersion: '2026-09-13',
  documents: [
    { kind: 'TERMS', current: null, draft: null },
    { kind: 'PRIVACY', current: PRIVACY_V1, draft: null },
    {
      kind: 'COOKIES',
      current: COOKIES_V1,
      draft: {
        content: '## 1. O que são cookies\n\nRascunho dos cookies.',
        updatedAt: '2026-09-27T15:00:00.000Z',
        updatedByEmail: 'lidiane@delcastanher.srv.br',
      },
    },
  ],
};

/** Servico simulado com o contrato do `AdminLegalService` (decisao 11). */
function fakeService() {
  const result = signal<AdminLegalDocumentsResult | null>(null);

  return {
    result,
    loading: signal(false),
    error: signal<string | null>(null),
    load: jasmine.createSpy('load').and.callFake(() => {
      result.set(RESULT);

      return of(RESULT);
    }),
    saveDraft: jasmine.createSpy('saveDraft').and.returnValue(of(RESULT)),
    discardDraft: jasmine.createSpy('discardDraft').and.returnValue(of(RESULT)),
    publish: jasmine.createSpy('publish').and.returnValue(of(RESULT)),
    versions: jasmine.createSpy('versions').and.returnValue(of([PRIVACY_V2, PRIVACY_V1])),
  };
}

/** Aba "Politicas & Termos" sobre o servico simulado (Spec 022, Fase 1). */
describe('AdminPoliticas', () => {
  let fixture: ComponentFixture<AdminPoliticas>;
  let service: ReturnType<typeof fakeService>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => (el().textContent ?? '').replace(/\s+/g, ' ');
  const card = (kind: string) => el().querySelector(`[data-testid="documento-${kind}"]`) as HTMLElement;

  function button(label: string, root: HTMLElement = el()): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll('button')).find(
      b => b.textContent!.trim() === label,
    );

    if (!found) {
      throw new Error(`Botão "${label}" não encontrado`);
    }

    return found;
  }

  function click(label: string, root?: HTMLElement): void {
    button(label, root).click();
    fixture.detectChanges();
  }

  function type(value: string): void {
    const area = el().querySelector('textarea') as HTMLTextAreaElement;
    area.value = value;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    service = fakeService();

    await TestBed.configureTestingModule({
      imports: [AdminPoliticas],
      providers: [{ provide: AdminLegalService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPoliticas);
    fixture.detectChanges();
  });

  it('tem h1 no cabeçalho da aba', () => {
    expect(el().querySelector('h1')?.textContent).toContain('Políticas e Termos de Uso');
  });

  it('mantém os avisos de maquete enquanto a aba não está ligada ao banco', () => {
    expect(text()).toContain('Área em construção');

    click('Editar', card('PRIVACY'));

    expect(text()).toContain('Maquete');
  });

  describe('lista', () => {
    it('mostra os três documentos na ordem', () => {
      const titles = Array.from(el().querySelectorAll('li h2')).map(h => h.textContent!.trim());

      expect(titles).toEqual(['Termos de Uso', 'Política de Privacidade', 'Política de Cookies']);
    });

    it('diz quando o documento não foi publicado', () => {
      expect(card('TERMS').textContent).toContain('Não publicado');
    });

    it('diz versão, data e autor do publicado', () => {
      expect(card('PRIVACY').textContent).toContain(
        'Publicado — versão 2026-09-13, em 13/09/2026 (carga inicial)',
      );
    });

    it('marca o rascunho não publicado', () => {
      expect(card('COOKIES').textContent).toContain('Rascunho não publicado');
      expect(card('PRIVACY').textContent).not.toContain('Rascunho não publicado');
    });

    it('só oferece histórico a quem tem versão publicada', () => {
      expect(() => button('Histórico', card('TERMS'))).toThrow();
      expect(button('Histórico', card('PRIVACY'))).toBeTruthy();
    });
  });

  describe('editor', () => {
    it('abre o texto publicado quando não há rascunho', () => {
      click('Editar', card('PRIVACY'));

      expect((el().querySelector('textarea') as HTMLTextAreaElement).value).toBe(PRIVACY_V1.content);
    });

    it('abre o rascunho quando há um', () => {
      click('Editar', card('COOKIES'));

      expect((el().querySelector('textarea') as HTMLTextAreaElement).value).toContain('Rascunho dos cookies.');
    });

    it('atualiza a pré-visualização enquanto digita, pelo parser', () => {
      click('Editar', card('TERMS'));
      type('## 1. Aceitação\nPrimeiro parágrafo.\n- item um');

      const previa = el().querySelector('[data-testid="previa"]') as HTMLElement;

      expect(previa.querySelector('h2')?.textContent).toContain('1. Aceitação');
      expect(previa.querySelector('li')?.textContent).toContain('item um');
    });

    it('mostra HTML colado como texto', () => {
      click('Editar', card('TERMS'));
      type('<script>alert(1)</script>');

      const previa = el().querySelector('[data-testid="previa"]') as HTMLElement;

      expect(previa.querySelector('script')).toBeNull();
      expect(previa.textContent).toContain('<script>alert(1)</script>');
    });

    it('salva o rascunho com o texto do editor', () => {
      click('Editar', card('PRIVACY'));
      type('## 1. Objetivo\n\nTexto novo.');
      click('Salvar rascunho');

      expect(service.saveDraft).toHaveBeenCalledWith('PRIVACY', '## 1. Objetivo\n\nTexto novo.');
      expect(text()).not.toContain('Alterações não salvas');
    });

    it('descarta o rascunho depois de confirmar e volta ao texto publicado', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      click('Editar', card('COOKIES'));
      click('Descartar rascunho');

      expect(service.discardDraft).toHaveBeenCalledWith('COOKIES');
      expect((el().querySelector('textarea') as HTMLTextAreaElement).value).toBe(COOKIES_V1.content);
    });

    it('mostra a recusa do servidor ao salvar', () => {
      service.saveDraft.and.returnValue(throwError(() => 'O texto não pode ficar vazio.'));
      click('Editar', card('PRIVACY'));
      type('x');
      click('Salvar rascunho');

      expect(el().querySelector('[role="alert"]')?.textContent).toContain('O texto não pode ficar vazio.');
    });

    it('mostra o aviso fixo só no editor da Política de Cookies', () => {
      click('Editar', card('COOKIES'));
      expect(el().querySelector('[data-testid="aviso-cookies"]')?.textContent).toContain(
        'Mudanças nos cookies exigem revisão técnica antes de publicar',
      );

      click('Voltar à lista');
      click('Editar', card('PRIVACY'));
      expect(el().querySelector('[data-testid="aviso-cookies"]')).toBeNull();
    });

    it('pede confirmação ao sair com alteração não salva, e fica se a resposta for não', () => {
      const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
      click('Editar', card('PRIVACY'));
      type('mudou');
      click('Voltar à lista');

      expect(confirmSpy).toHaveBeenCalled();
      expect(el().querySelector('textarea')).not.toBeNull();
    });

    it('sai sem perguntar quando não há alteração', () => {
      const confirmSpy = spyOn(window, 'confirm');
      click('Editar', card('PRIVACY'));
      click('Voltar à lista');

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(el().querySelector('textarea')).toBeNull();
    });
  });

  describe('publicação', () => {
    const dialog = () => el().querySelector('[role="dialog"]') as HTMLElement;

    it('oferece nova versão e correção, com o efeito de cada uma', () => {
      click('Editar', card('PRIVACY'));
      type('## 1. Objetivo\n\nTexto corrigido.');
      click('Publicar');

      const conteudo = dialog().textContent!.replace(/\s+/g, ' ');

      expect(conteudo).toContain('Nova versão reabre o aviso de cookies para todos os visitantes');
      expect(conteudo).toContain('continua 2026-09-13 e o aviso de cookies não reabre');
      expect(dialog().querySelectorAll('input[type="radio"]').length).toBe(2);
    });

    it('só oferece nova versão na primeira publicação dos Termos', () => {
      click('Editar', card('TERMS'));
      type('## 1. Aceitação\n\nTexto do jurídico.');
      click('Publicar');

      expect(dialog().querySelectorAll('input[type="radio"]').length).toBe(1);
      expect(dialog().querySelector('[data-testid="so-nova-versao"]')).not.toBeNull();
      expect(dialog().textContent).not.toContain('Correção');
    });

    it('salva o texto da tela antes de publicar a correção escolhida', () => {
      click('Editar', card('PRIVACY'));
      type('## 1. Objetivo\n\nTexto corrigido.');
      click('Publicar');

      (dialog().querySelector('input[value="CORRECTION"]') as HTMLInputElement).click();
      fixture.detectChanges();
      click('Publicar', dialog());

      expect(service.saveDraft).toHaveBeenCalledWith('PRIVACY', '## 1. Objetivo\n\nTexto corrigido.');
      expect(service.publish).toHaveBeenCalledWith('PRIVACY', 'CORRECTION');
      expect(text()).toContain('Política de Privacidade publicado');
    });

    it('publica o rascunho salvo sem salvar de novo', () => {
      click('Editar', card('COOKIES'));
      click('Publicar');
      click('Publicar', dialog());

      expect(service.saveDraft).not.toHaveBeenCalled();
      expect(service.publish).toHaveBeenCalledWith('COOKIES', 'NEW_VERSION');
    });

    it('não deixa publicar sem nada novo', () => {
      click('Editar', card('PRIVACY'));

      expect(button('Publicar').disabled).toBeTrue();
    });

    it('mantém o diálogo aberto e mostra a recusa do servidor', () => {
      service.publish.and.returnValue(throwError(() => 'Não há rascunho para publicar.'));
      click('Editar', card('COOKIES'));
      click('Publicar');
      click('Publicar', dialog());

      expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('Não há rascunho para publicar.');
    });
  });

  describe('histórico', () => {
    beforeEach(() => click('Histórico', card('PRIVACY')));

    it('lista as versões com data, tipo, autor e versão da política', () => {
      const linhas = Array.from(el().querySelectorAll('tbody tr')).map(tr =>
        tr.textContent!.replace(/\s+/g, ' ').trim(),
      );

      expect(service.versions).toHaveBeenCalledWith('PRIVACY');
      expect(linhas[0]).toContain('20/09/2026');
      expect(linhas[0]).toContain('Correção');
      expect(linhas[0]).toContain('lidiane@delcastanher.srv.br');
      expect(linhas[0]).toContain('2026-09-13');
      expect(linhas[1]).toContain('Carga inicial');
    });

    it('abre uma versão para leitura', () => {
      click('Ler', el().querySelector('tbody tr') as HTMLElement);

      expect(el().querySelector('[role="dialog"]')?.textContent).toContain('Texto corrigido.');
    });
  });
});
