import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/** Um ponto da serie. O valor e sempre centavo inteiro (Spec 016, decisao 2). */
export interface TimeSeriesPoint {
  /** Chave do periodo, no fuso do relatorio: `2026-09-30` ou `2026-09`. */
  bucket: string;
  valueCents: number;
}

/** Geometria interna do desenho, em unidades do `viewBox`. */
const VIEW = { width: 720, height: 240, padLeft: 64, padRight: 12, padTop: 16, padBottom: 32 };

/** Quantas linhas horizontais a grade tem, contando a do zero. */
const GRID_LINES = 4;

/**
 * Sequencial dos ids. O `aria-describedby` do SVG aponta para a tabela
 * equivalente, e dois graficos na mesma tela nao podem compartilhar o id.
 */
let sequence = 0;

/** Uma barra desenhada, ja posicionada. */
interface Bar {
  point: TimeSeriesPoint;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

/**
 * Serie temporal em SVG **escrito aqui**, e nao em Chart.js (Spec 016,
 * decisao 16).
 *
 * Sao dois graficos, de uma serie cada, com no maximo 31 pontos. Contra a
 * biblioteca pesavam quatro coisas concretas neste projeto: ela desenha em
 * `<canvas>`, que o SSR ja ligado entrega em branco e que leitor de tela nao
 * le; ela traz o proprio sistema de cores, fontes e tooltip, que teria de ser
 * reconfigurado inteiro para o Design System da Spec 002; ela seria a primeira
 * dependencia de runtime do front desde o `@mux/mux-player`, que entrou porque
 * tocar video protegido nao se escreve a mao — desenhar 31 retangulos se
 * escreve; e ela empurra a acessibilidade para um `aria-label` generico.
 *
 * A conclusao vale **para este grafico**: zoom, pan, series multiplas ou tempo
 * real justificariam revisitar a biblioteca, e nada disso esta aqui.
 *
 * A **tabela de dados equivalente** nao e um extra: e o conteudo acessivel do
 * SVG, e e tambem o que a tela mostra quando a serie tem um ponto so — um
 * grafico de barra unica nao compara nada.
 */
@Component({
  selector: 'ui-time-series-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (bars().length > 1) {
      <figure class="m-0">
        <svg
          [attr.viewBox]="viewBox"
          class="w-full"
          [style.height.px]="height()"
          role="img"
          [attr.aria-label]="label()"
          [attr.aria-describedby]="tableId">
          <!-- Grade e eixos sao elementos, e nao pixels pintados: eles ficam
               legiveis no zoom do navegador e no modo de alto contraste. -->
          <g aria-hidden="true">
            @for (line of gridLines(); track line.value) {
              <line
                [attr.x1]="padLeft"
                [attr.x2]="innerRight"
                [attr.y1]="line.y"
                [attr.y2]="line.y"
                class="stroke-brand-navy/10"
                stroke-width="1" />
              <text
                [attr.x]="padLeft - 8"
                [attr.y]="line.y + 4"
                text-anchor="end"
                class="fill-slate-500 text-[11px] tabular-nums">
                {{ line.label }}
              </text>
            }

            <line
              [attr.x1]="padLeft"
              [attr.x2]="innerRight"
              [attr.y1]="baseline"
              [attr.y2]="baseline"
              class="stroke-brand-navy/25"
              stroke-width="1" />
          </g>

          <g>
            @for (bar of bars(); track bar.point.bucket) {
              <rect
                [attr.x]="bar.x"
                [attr.y]="bar.y"
                [attr.width]="bar.width"
                [attr.height]="bar.height"
                rx="3"
                class="fill-brand-teal transition-opacity"
                [class.opacity-100]="active() === bar.index"
                [class.opacity-80]="active() !== bar.index"
                tabindex="0"
                role="button"
                [attr.aria-label]="bar.label"
                (mouseenter)="active.set(bar.index)"
                (mouseleave)="active.set(null)"
                (focus)="active.set(bar.index)"
                (blur)="active.set(null)" />
            }
          </g>

          <g aria-hidden="true">
            @for (tick of ticks(); track tick.bucket) {
              <text
                [attr.x]="tick.x"
                [attr.y]="viewHeight - 10"
                text-anchor="middle"
                class="fill-slate-500 text-[11px]">
                {{ tick.label }}
              </text>
            }
          </g>
        </svg>

        @if (hovered(); as bar) {
          <figcaption
            class="mt-2 inline-flex items-center gap-2 rounded-xl border border-brand-navy/10 bg-white/90 px-3 py-1.5 text-xs font-semibold text-brand-navy shadow-sm">
            {{ bar.label }}
          </figcaption>
        }
      </figure>
    }

    <!-- Conteudo acessivel do grafico, e a propria tela quando ha um ponto so.
         Quem navega por leitor de tela le os mesmos numeros, e nao um resumo. -->
    <table
      [id]="tableId"
      class="w-full text-sm"
      [class.sr-only]="bars().length > 1"
      [class.mt-2]="bars().length <= 1">
      <caption class="sr-only">{{ label() }}</caption>
      <thead>
        <tr class="text-left text-xs font-bold uppercase tracking-widest text-slate-500">
          <th scope="col" class="py-1">{{ periodLabel() }}</th>
          <th scope="col" class="py-1 text-right">{{ valueLabel() }}</th>
        </tr>
      </thead>
      <tbody>
        @for (point of points(); track point.bucket) {
          <tr class="border-t border-brand-navy/5">
            <td class="py-1 text-slate-700">{{ formatBucket(point.bucket) }}</td>
            <td class="py-1 text-right font-semibold tabular-nums text-brand-navy">
              {{ formatValue(point.valueCents) }}
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class TimeSeriesChart {
  readonly points = input<TimeSeriesPoint[]>([]);
  readonly label = input('Série temporal');
  readonly periodLabel = input('Período');
  readonly valueLabel = input('Valor');
  readonly height = input(240);

  /** Barra sob o cursor ou com foco; nula quando nenhuma esta ativa. */
  protected readonly active = signal<number | null>(null);

  protected readonly tableId = `serie-${(sequence += 1)}`;

  protected readonly viewBox = `0 0 ${VIEW.width} ${VIEW.height}`;
  protected readonly viewHeight = VIEW.height;
  protected readonly padLeft = VIEW.padLeft;
  protected readonly innerRight = VIEW.width - VIEW.padRight;
  protected readonly baseline = VIEW.height - VIEW.padBottom;

  /**
   * O teto da escala. Serie toda zerada usa **1** como teto: dividir por zero
   * produziria `NaN` em toda altura, e o grafico sumiria em vez de mostrar a
   * linha de base.
   */
  private readonly max = computed(() =>
    Math.max(1, ...this.points().map(point => point.valueCents)),
  );

  protected readonly bars = computed<Bar[]>(() => {
    const points = this.points();

    if (points.length === 0) {
      return [];
    }

    const usable = this.innerRight - VIEW.padLeft;
    const slot = usable / points.length;
    const width = Math.max(2, slot * 0.62);
    const plot = this.baseline - VIEW.padTop;

    return points.map((point, index) => {
      const height = Math.max(0, (point.valueCents / this.max()) * plot);

      return {
        point,
        index,
        x: VIEW.padLeft + slot * index + (slot - width) / 2,
        y: this.baseline - height,
        width,
        height,
        label: `${this.formatBucket(point.bucket)}: ${this.formatValue(point.valueCents)}`,
      };
    });
  });

  protected readonly hovered = computed(() => {
    const index = this.active();

    return index === null ? null : (this.bars()[index] ?? null);
  });

  /** Linhas da grade, do teto ate a base, com o rotulo ja formatado. */
  protected readonly gridLines = computed(() => {
    const plot = this.baseline - VIEW.padTop;

    return Array.from({ length: GRID_LINES }, (_, index) => {
      const fraction = 1 - index / GRID_LINES;

      return {
        value: Math.round(this.max() * fraction),
        y: this.baseline - plot * fraction,
        label: this.formatValue(Math.round(this.max() * fraction)),
      };
    });
  });

  /**
   * Rotulos do eixo horizontal. Com muitos pontos so alguns sao escritos — 31
   * datas lado a lado viram um borrao, e a tabela equivalente continua tendo
   * todas.
   */
  protected readonly ticks = computed(() => {
    const bars = this.bars();
    const step = Math.max(1, Math.ceil(bars.length / 8));

    return bars
      .filter((_, index) => index % step === 0)
      .map(bar => ({
        bucket: bar.point.bucket,
        x: bar.x + bar.width / 2,
        label: this.formatBucket(bar.point.bucket),
      }));
  });

  /** `2026-09-30` vira `30/09`; `2026-09` vira `09/2026`. */
  protected formatBucket(bucket: string): string {
    const parts = bucket.split('-');

    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : `${parts[1]}/${parts[0]}`;
  }

  /** Centavos em reais. A formatacao acontece aqui, e nunca na API (decisao 2). */
  protected formatValue(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    });
  }
}
