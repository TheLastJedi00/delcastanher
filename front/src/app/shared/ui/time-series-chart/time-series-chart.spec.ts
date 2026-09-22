import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TimeSeriesChart, TimeSeriesPoint } from './time-series-chart';

const SERIE: TimeSeriesPoint[] = [
  { bucket: '2026-09-09', valueCents: 0 },
  { bucket: '2026-09-10', valueCents: 19900 },
  { bucket: '2026-09-11', valueCents: 39800 },
];

describe('TimeSeriesChart', () => {
  let fixture: ComponentFixture<TimeSeriesChart>;

  function render(points: TimeSeriesPoint[]) {
    fixture = TestBed.createComponent(TimeSeriesChart);
    fixture.componentRef.setInput('points', points);
    fixture.detectChanges();
  }

  beforeEach(() => TestBed.configureTestingModule({}));

  it('renderiza um elemento por ponto, na ordem recebida', () => {
    render(SERIE);

    const barras = fixture.debugElement.queryAll(By.css('svg rect'));

    expect(barras.length).toBe(3);
    expect(barras[0].nativeElement.getAttribute('aria-label')).toContain('09/09');
    expect(barras[2].nativeElement.getAttribute('aria-label')).toContain('11/09');
  });

  /**
   * Spec 016, decisao 16: a tabela equivalente e o conteudo acessivel do SVG,
   * e nao um extra. Quem navega por leitor de tela le os mesmos numeros.
   */
  it('traz a tabela equivalente com os mesmos valores', () => {
    render(SERIE);

    const linhas = fixture.debugElement.queryAll(By.css('tbody tr'));

    expect(linhas.length).toBe(3);
    expect(linhas[1].nativeElement.textContent).toContain('10/09');
    expect(linhas[1].nativeElement.textContent.replace(/\s| /g, '')).toContain('R$199');
  });

  it('descreve o SVG pela tabela equivalente', () => {
    render(SERIE);

    const svg = fixture.debugElement.query(By.css('svg')).nativeElement as SVGElement;
    const tabela = fixture.debugElement.query(By.css('table')).nativeElement as HTMLElement;

    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-describedby')).toBe(tabela.id);
  });

  it('deixa cada ponto alcancavel pelo teclado', () => {
    render(SERIE);

    const barras = fixture.debugElement.queryAll(By.css('svg rect'));

    expect(barras.every(bar => bar.nativeElement.getAttribute('tabindex') === '0')).toBeTrue();
  });

  it('serie vazia nao desenha eixo nem ponto', () => {
    render([]);

    expect(fixture.debugElement.query(By.css('svg'))).toBeNull();
    expect(fixture.debugElement.queryAll(By.css('tbody tr')).length).toBe(0);
  });

  /**
   * Um grafico de barra unica nao compara nada: com um ponto so a tela mostra
   * a tabela, que e a mesma que serve de conteudo acessivel.
   */
  it('serie de um ponto mostra a tabela, e nao o grafico', () => {
    render([SERIE[1]]);

    expect(fixture.debugElement.query(By.css('svg'))).toBeNull();

    const tabela = fixture.debugElement.query(By.css('table')).nativeElement as HTMLElement;

    expect(tabela.classList).not.toContain('sr-only');
  });

  it('valor maximo zero nao produz divisao por zero na escala', () => {
    render([
      { bucket: '2026-09-09', valueCents: 0 },
      { bucket: '2026-09-10', valueCents: 0 },
    ]);

    const alturas = fixture.debugElement
      .queryAll(By.css('svg rect'))
      .map(bar => Number(bar.nativeElement.getAttribute('height')));

    expect(alturas.every(height => Number.isFinite(height))).toBeTrue();
    expect(alturas.every(height => height === 0)).toBeTrue();
  });

  it('mostra o valor do ponto ao receber o foco', () => {
    render(SERIE);

    const barra = fixture.debugElement.queryAll(By.css('svg rect'))[2];
    barra.triggerEventHandler('focus', {});
    fixture.detectChanges();

    const legenda = fixture.debugElement.query(By.css('figcaption'));

    expect(legenda.nativeElement.textContent).toContain('11/09');
  });

  it('formata o balde de mes como mes/ano', () => {
    render([
      { bucket: '2026-08', valueCents: 10000 },
      { bucket: '2026-09', valueCents: 20000 },
    ]);

    const linhas = fixture.debugElement.queryAll(By.css('tbody tr'));

    expect(linhas[0].nativeElement.textContent).toContain('08/2026');
  });
});
