import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CookieBanner } from './shared/ui/cookie-banner/cookie-banner';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, CookieBanner],
  // O banner vive fora do outlet de proposito: montado por rota, ele
  // desapareceria e reapareceria a cada navegacao antes de o visitante decidir.
  template: `
    <router-outlet />
    <ui-cookie-banner />
  `,
})
export class App {}
