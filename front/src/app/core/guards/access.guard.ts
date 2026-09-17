import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { StoreService } from '../services/store.service';

/**
 * Portao da area do aluno (Spec 014, decisao 19).
 *
 * Quem nao tem **nenhum** acesso ativo vai para a loja: a conta existe, o
 * perfil e editavel, mas o conteudo nao abre. Quem tem acesso parcial entra
 * normalmente — a trilha mostra o que ele comprou e vende o resto (decisao 17).
 *
 * Este guard e conveniencia de navegacao, e nao a protecao: quem protege
 * video, material, progresso e certificado e o servidor, que responde 403 sem
 * acesso. Um cadeado desenhado aqui so protegeria quem usa o front.
 *
 * `/ava/perfil` fica de fora: corrigir os proprios dados e exercer os direitos
 * da Spec 009 nao podem depender de ter comprado alguma coisa.
 */
export const accessGuard: CanActivateFn = () => {
  const router = inject(Router);
  const store = inject(StoreService);

  return store.loadCatalog().pipe(
    map(catalog =>
      catalog.some(module => module.access.unlocked) ? true : router.parseUrl('/loja'),
    ),
    // Falha de rede nao pode trancar quem pagou. O conteudo em si continua
    // protegido pelo servidor, entao deixar passar aqui nao abre nada: o pior
    // caso e um AVA que mostra 403 nas aulas, e nao um aluno barrado na porta
    // por um erro de infraestrutura.
    catchError(() => of(true)),
  );
};
