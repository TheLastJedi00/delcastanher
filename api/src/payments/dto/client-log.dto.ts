import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Etapas do navegador no caminho do cartao (Spec 028, decisao 9). */
export const CLIENT_LOG_STAGES = [
  'sdk_load',
  'secure_fields',
  'payment_method',
  'installments',
  'tokenize',
] as const;

/**
 * Evento do navegador para `payment_logs`. Lista branca curta: o que nao esta
 * aqui e recusado pelo `forbidNonWhitelisted`, e a rota nao vira um deposito.
 * O navegador nao manda `orderId` nem `userId`: o aluno vem do token, e o
 * pedido e ligado pela tentativa.
 */
export class ClientLogDto {
  @IsOptional()
  @IsUUID('4', { message: 'Tentativa invalida.' })
  attemptId?: string;

  @IsIn(CLIENT_LOG_STAGES, { message: 'Etapa invalida.' })
  stage!: (typeof CLIENT_LOG_STAGES)[number];

  /** `INFO` nao vem do navegador: o que da certo ali nao precisa de log. */
  @IsIn(['ERROR', 'WARNING'], { message: 'Nivel invalido.' })
  level!: 'ERROR' | 'WARNING';

  @IsString({ message: 'Mensagem ausente.' })
  @IsNotEmpty({ message: 'Mensagem ausente.' })
  @MaxLength(300)
  message!: string;

  /** Contexto do erro (codigos do SDK, BIN de 6 digitos). Limpo e cortado no servico. */
  @IsOptional()
  @IsObject()
  detail?: Record<string, unknown>;
}
