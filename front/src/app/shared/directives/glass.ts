import { Directive, computed, input } from '@angular/core';

/** Aplica uma das variantes de glassmorphism sem poluir o template. */
@Directive({
  selector: '[glass]',
  host: { '[class]': 'className()' },
})
export class Glass {
  readonly glass = input<'' | 'dark' | 'teal'>('');

  protected readonly className = computed(() => {
    const variant = this.glass();
    return variant ? `glass-${variant}` : 'glass';
  });
}
