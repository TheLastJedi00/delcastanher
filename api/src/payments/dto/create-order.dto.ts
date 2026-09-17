import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Limite de parcelas da plataforma (Spec 014, decisao 9). */
export const MAX_INSTALLMENTS = 6;

/**
 * Dados do cartao que **podem** trafegar: o token e o que o SDK resolveu a
 * partir dele. Numero, validade e CVV nunca chegam aqui — eles vivem dentro dos
 * Secure Fields do Mercado Pago e nao existem como valor no `front/`
 * (decisao 8).
 */
export class OrderCardDto {
  @IsString({ message: 'Token do cartao ausente.' })
  @IsNotEmpty({ message: 'Token do cartao ausente.' })
  token!: string;

  @IsString({ message: 'Meio de pagamento do cartao ausente.' })
  @IsNotEmpty({ message: 'Meio de pagamento do cartao ausente.' })
  paymentMethodId!: string;

  @Type(() => Number)
  @IsInt({ message: 'Numero de parcelas invalido.' })
  @Min(1, { message: 'Numero de parcelas invalido.' })
  @Max(MAX_INSTALLMENTS, { message: `Parcelamento maximo de ${MAX_INSTALLMENTS}x.` })
  installments!: number;
}

/**
 * Pagador. O CPF e obrigatorio para PIX e melhora a aprovacao no cartao
 * (decisao 15) — e por ser dado novo na plataforma, entrou na Politica de
 * Privacidade.
 */
export class OrderPayerDto {
  @IsString({ message: 'Informe o nome.' })
  @IsNotEmpty({ message: 'Informe o nome.' })
  @MaxLength(80)
  firstName!: string;

  @IsString({ message: 'Informe o sobrenome.' })
  @IsNotEmpty({ message: 'Informe o sobrenome.' })
  @MaxLength(80)
  lastName!: string;

  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email!: string;

  /** So digitos: a mascara e da tela, o dado e limpo. */
  @Matches(/^\d{11}$/, { message: 'Informe um CPF valido.' })
  document!: string;
}

/**
 * Criacao do pedido. **Nao existe campo de preco aqui**, e isso e a decisao 2:
 * o valor e somado no servidor a partir de `Module.priceCents`. Aceitar valor
 * do navegador seria deixar o comprador escolher quanto pagar.
 */
export class CreateOrderDto {
  @IsString({ each: true, message: 'Cada modulo precisa ser um id.' })
  @ArrayMinSize(1, { message: 'Escolha ao menos um modulo.' })
  @ArrayMaxSize(50, { message: 'Modulos demais em um unico pedido.' })
  @ArrayUnique({ message: 'Modulo repetido no pedido.' })
  moduleIds!: string[];

  // Conjunto fechado: valor fora dele e recusado, e nunca convertido no default
  // em silencio.
  @IsIn(['PIX', 'CREDIT_CARD'], { message: 'Meio de pagamento invalido.' })
  method!: 'PIX' | 'CREDIT_CARD';

  @ValidateNested()
  @Type(() => OrderPayerDto)
  payer!: OrderPayerDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Numero de parcelas invalido.' })
  @Min(1, { message: 'Numero de parcelas invalido.' })
  @Max(MAX_INSTALLMENTS, { message: `Parcelamento maximo de ${MAX_INSTALLMENTS}x.` })
  installments?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => OrderCardDto)
  card?: OrderCardDto;

  /**
   * `MP_DEVICE_SESSION_ID` capturado pelo SDK no navegador (checklist, item
   * 10). Opcional porque bloqueador de script pode impedir a captura — e um
   * pagamento sem device id ainda e melhor do que um checkout que nao envia.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;
}
