import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'ui-section-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div [class]="wrapperClasses()">
      @if (overline()) {
        <p class="text-xs font-bold uppercase tracking-widest text-brand-teal-deep mb-2">{{ overline() }}</p>
      }
      @if (level() === 'h1') {
        <h1 [class]="headingClasses">{{ title() }}</h1>
      } @else {
        <h2 [class]="headingClasses">{{ title() }}</h2>
      }
      @if (subtitle()) {
        <p class="mt-3 text-base text-slate-500 max-w-2xl" [class.mx-auto]="align() === 'center'">
          {{ subtitle() }}
        </p>
      }
    </div>
  `,
})
export class SectionHeader {
  readonly overline = input('');
  readonly title = input('');
  readonly subtitle = input('');
  readonly align = input<'left' | 'center'>('left');
  /**
   * Nivel do cabecalho (Spec 009, Task 4.10).
   *
   * Fica em `h2` por padrao porque o uso mais comum e titular uma secao abaixo
   * do `h1` da pagina. Nas telas em que este componente **e** o titulo da
   * pagina — hub do aluno, certificado, portal de validacao — passa a `h1`:
   * sem isso a pagina inteira comeca em `h2`, e nenhuma pula direto para o
   * nivel certo so porque o texto parece um titulo.
   */
  readonly level = input<'h1' | 'h2'>('h2');

  protected readonly headingClasses =
    'text-3xl md:text-4xl font-bold tracking-tight text-brand-navy';

  protected readonly wrapperClasses = computed(() =>
    this.align() === 'center' ? 'text-center' : 'text-left'
  );
}
