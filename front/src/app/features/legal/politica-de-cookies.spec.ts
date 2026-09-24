import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONSENT_POLICY_VERSION, ConsentService } from '../../core/services/consent.service';
import { COMPANY } from './company-info';
import { LEGAL_PLACEHOLDER } from './legal-page';
import { PoliticaDeCookies } from './politica-de-cookies';

/**
 * A Politica de Cookies descreve o comportamento do proprio sistema, entao ela
 * pode mentir de um jeito que a Politica de Privacidade nao pode: ficando
 * desatualizada em relacao ao codigo.
 *
 * Estes testes amarram o texto ao que o `ConsentService` de fato faz — os dois
 * itens que ele grava, o unico cookie proprio (Spec 017) e a invalidacao por
 * versao.
 * Se alguem trocar a chave de armazenamento ou passar a gravar cookie de
 * verdade, a suite cai junto com a afirmacao que deixou de ser verdadeira.
 */
describe('PoliticaDeCookies', () => {
  let fixture: ComponentFixture<PoliticaDeCookies>;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    fixture = TestBed.createComponent(PoliticaDeCookies);
    fixture.detectChanges();
  });

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  }

  it('publica as seis seções redigidas', () => {
    const titulos = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('h2')
    ).map(h => h.textContent!.trim());

    expect(titulos).toEqual([
      '1. O que são cookies',
      '2. Itens necessários ao funcionamento',
      '3. Medição de audiência',
      '4. Como gerenciar sua escolha',
      '5. Prazo de validade do consentimento',
      '6. Contato',
    ]);
  });

  it('não é mais um documento pendente de revisão jurídica', () => {
    expect(texto()).not.toContain(LEGAL_PLACEHOLDER);
    expect(texto()).not.toContain('Documento pendente de revisão jurídica');
    expect(texto()).not.toContain('A cláusula deve cobrir');
  });

  it('nomeia exatamente os itens que a plataforma grava no navegador', () => {
    expect(texto()).toContain('delcastanher.has-session');
    expect(texto()).toContain('delcastanher.consent');
    // Chave anterior a Spec 017, que o AuthService apaga: citar seria mentir.
    expect(texto()).not.toContain('delcastanher.session ');
  });

  it('declara o único cookie próprio, o do refresh token emitido pela API (Spec 017)', () => {
    expect(texto()).toContain('grava um único cookie próprio');
    expect(texto()).toContain('__Secure-refresh');
    expect(texto()).toContain('Vale por 30 dias, renovados a cada uso');
    expect(texto()).not.toContain('não grava nenhum cookie próprio');
  });

  it('garante que nada de medição carrega antes do aceite', () => {
    expect(texto()).toContain('Nada disso é carregado antes do seu aceite');
  });

  it('descreve a validade do consentimento como ligada à versão, e não a um prazo', () => {
    expect(texto()).toContain('Não há prazo fixo de expiração');
    expect(texto()).toContain('deixa automaticamente de valer');
  });

  it('exibe a versão vigente da política, que é a que invalida o aceite antigo', () => {
    expect(texto()).toContain(`Versão vigente: ${CONSENT_POLICY_VERSION}`);
  });

  it('aponta para o mesmo canal de atendimento da Política de Privacidade', () => {
    expect(texto()).toContain(COMPANY.email);
    expect(texto()).toContain(COMPANY.phone);
  });

  describe('controle de preferências', () => {
    it('informa que nenhuma escolha foi registrada nesta versão', () => {
      expect(texto()).toContain('ainda não registrou uma escolha nesta versão');
    });

    it('mostra a escolha registrada e permite reabrir o banner', () => {
      const consent = TestBed.inject(ConsentService);
      const reopen = spyOn(consent, 'reopen');

      consent.accept();
      fixture.detectChanges();

      expect(texto()).toContain('Você aceitou');
      expect(texto()).toContain(CONSENT_POLICY_VERSION);

      // Pelo texto, e nao pelo primeiro <button> do DOM: o cabecalho e o rodape
      // tambem tem botoes, e um deles e justamente o "Preferencias de cookies"
      // do ui-legal-links, que chamaria o mesmo metodo e faria o teste passar
      // sem provar nada sobre o controle desta pagina.
      const botao = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button')
      ).find(b => b.textContent!.includes('Rever preferências de cookies'));

      botao!.click();

      expect(reopen).toHaveBeenCalled();
    });
  });
});
