import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Granularidades da serie temporal. */
export const FINANCE_GRANULARITIES = ['day', 'month'] as const;
export type FinanceGranularityValue = (typeof FINANCE_GRANULARITIES)[number];

/** Colunas por onde a lista de pedidos pode ser ordenada. */
export const FINANCE_ORDER_SORTS = ['data', 'valor', 'situacao'] as const;
export type FinanceOrderSort = (typeof FINANCE_ORDER_SORTS)[number];

/** Situacoes do pedido, as mesmas do enum do banco. */
export const FINANCE_ORDER_STATUSES = [
  'PENDING',
  'PAID',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
] as const;

/** Meios de pagamento aceitos. */
export const FINANCE_ORDER_METHODS = ['PIX', 'CREDIT_CARD'] as const;

/**
 * Recorte de periodo, comum ao resumo e a lista.
 *
 * Ausencia dos dois cai nos ultimos 30 dias — a mesma janela do
 * `ACTIVITY_WINDOW_DAYS` da Spec 013, para que as duas abas do painel nao
 * tenham dois "recente" diferentes. `from` posterior a `to` e recusado no
 * `resolvePeriod`, que e onde o par faz sentido como par.
 */
export class FinancePeriodDto {
  @IsOptional()
  @IsISO8601({}, { message: 'A data inicial precisa estar no formato ISO 8601.' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'A data final precisa estar no formato ISO 8601.' })
  to?: string;
}

/**
 * Filtro do resumo financeiro.
 *
 * Valor fora do conjunto e **recusado**, e nao trocado em silencio pelo
 * default, no criterio do `ListAdminUsersDto`.
 */
export class FinanceSummaryDto extends FinancePeriodDto {
  @IsOptional()
  @IsIn(FINANCE_GRANULARITIES, { message: 'A granularidade precisa ser day ou month.' })
  granularity: FinanceGranularityValue = 'day';
}

/** Filtro da lista de pedidos. Tudo aqui vira clausula de banco (decisao 12). */
export class ListFinanceOrdersDto extends FinancePeriodDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A pagina precisa ser um numero inteiro.' })
  @Min(1, { message: 'A pagina comeca em 1.' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O tamanho da pagina precisa ser um numero inteiro.' })
  @Min(1, { message: 'O tamanho da pagina comeca em 1.' })
  // Mesmo teto da Spec 013: quem quer tudo usa a exportacao, e nao uma
  // listagem sem limite por acidente.
  @Max(100, { message: 'O tamanho maximo da pagina e 100.' })
  pageSize: number = 20;

  @IsOptional()
  @IsString({ message: 'O termo de busca precisa ser texto.' })
  @MaxLength(120, { message: 'Termo de busca muito longo.' })
  search?: string;

  @IsOptional()
  @IsIn(FINANCE_ORDER_STATUSES, { message: 'Situacao de pedido desconhecida.' })
  status?: (typeof FINANCE_ORDER_STATUSES)[number];

  @IsOptional()
  @IsIn(FINANCE_ORDER_METHODS, { message: 'O metodo precisa ser PIX ou CREDIT_CARD.' })
  method?: (typeof FINANCE_ORDER_METHODS)[number];

  @IsOptional()
  @IsIn(FINANCE_ORDER_SORTS, { message: 'Ordene por data, valor ou situacao.' })
  sort: FinanceOrderSort = 'data';

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'A direcao precisa ser asc ou desc.' })
  direction: 'asc' | 'desc' = 'desc';
}
