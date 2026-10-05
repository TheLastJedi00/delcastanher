import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

/** Endereco que o ViaCEP devolve, nos nomes do pedido (Spec 023, decisao A3). */
export interface CepAddress {
  zip: string;
  street: string;
  district: string;
  city: string;
  /** Codigo IBGE do municipio: a NF-e identifica a cidade por ele. */
  cityIbge: string;
  state: string;
}

/** Resposta do ViaCEP, no que esta tela usa. */
interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  erro?: boolean | string;
}

/**
 * Consulta de CEP pelo ViaCEP (Spec 023, decisao A3). Publico, sem chave, e
 * fora da API — o interceptor de autenticacao so age nas URLs da API, entao o
 * token nunca vai para la.
 *
 * `null` e "CEP nao encontrado"; falha de rede tambem vira `null`, e a tela
 * diz para conferir o CEP. Sem o codigo IBGE nao ha nota, entao um endereco
 * digitado a mao nao substitui a consulta.
 */
@Injectable({ providedIn: 'root' })
export class CepService {
  private readonly http = inject(HttpClient);

  lookup(cep: string): Observable<CepAddress | null> {
    const digits = cep.replace(/\D/g, '');

    if (digits.length !== 8) {
      return of(null);
    }

    return this.http.get<ViaCepResponse>(`https://viacep.com.br/ws/${digits}/json/`).pipe(
      map(response =>
        response.erro || !response.ibge || !response.uf
          ? null
          : {
              zip: digits,
              street: response.logradouro ?? '',
              district: response.bairro ?? '',
              city: response.localidade ?? '',
              cityIbge: response.ibge,
              state: response.uf,
            },
      ),
      catchError(() => of(null)),
    );
  }
}
