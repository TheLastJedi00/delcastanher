import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Colunas por onde a listagem pode ser ordenada. */
export const ADMIN_USER_SORTS = ['nome', 'matricula', 'acesso', 'progresso'] as const;
export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number];

/** Situacao da conta, no vocabulario da tela. */
export const ADMIN_USER_STATUSES = ['ativo', 'bloqueado'] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

/**
 * Filtro da listagem administrativa. Tudo aqui vira clausula de banco: a busca
 * e a paginacao sao do servidor, e nao de um `filter` sobre um array ja
 * baixado (Spec 013, decisao 7).
 *
 * Valor fora do conjunto e **recusado**, e nao silenciosamente trocado pelo
 * default: uma tela que pede ordenacao por uma coluna inexistente esta com
 * defeito, e responder 200 com outra ordem esconde o defeito.
 */
export class ListAdminUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A pagina precisa ser um numero inteiro.' })
  @Min(1, { message: 'A pagina comeca em 1.' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O tamanho da pagina precisa ser um numero inteiro.' })
  @Min(1, { message: 'O tamanho da pagina comeca em 1.' })
  // O teto existe para que a exportacao nao vire uma rota de listagem sem
  // limite por acidente: quem quer tudo usa `GET /admin/users/export`.
  @Max(100, { message: 'O tamanho maximo da pagina e 100.' })
  pageSize: number = 20;

  @IsOptional()
  @IsString({ message: 'O termo de busca precisa ser texto.' })
  @MaxLength(120, { message: 'Termo de busca muito longo.' })
  search?: string;

  @IsOptional()
  @IsIn(['aluno', 'admin'], { message: 'O papel precisa ser aluno ou admin.' })
  role?: 'aluno' | 'admin';

  @IsOptional()
  @IsIn(ADMIN_USER_STATUSES, { message: 'A situacao precisa ser ativo ou bloqueado.' })
  status?: AdminUserStatus;

  @IsOptional()
  @IsIn(ADMIN_USER_SORTS, {
    message: 'Ordene por nome, matricula, acesso ou progresso.',
  })
  sort: AdminUserSort = 'nome';

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'A direcao precisa ser asc ou desc.' })
  direction: 'asc' | 'desc' = 'asc';
}
