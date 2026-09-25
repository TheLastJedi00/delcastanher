import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  Validate,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Limite de parcelas da plataforma (Spec 014, decisao 9), que a Spec 019
 * (decisao 9) subiu de 6 para 12, com juros do comprador. O
 * `GET /store/payment-config` le esta constante, e nao repete o numero.
 */
export const MAX_INSTALLMENTS = 12;

/**
 * O pedido e **ou** de pacote **ou** de modulos avulsos (Spec 019, decisao 5).
 * Os dois juntos deixariam ambiguo o que se cobra; nenhum dos dois nao cobra
 * nada. A regra vive numa restricao so, e nao em dois `ValidateIf` que se
 * contradizem no mesmo campo.
 */
@ValidatorConstraint({ name: 'orderTarget' })
class OrderTargetConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateOrderDto;
    const hasBundle = dto.bundleSlug !== undefined && dto.bundleSlug !== null;
    const hasModules = Array.isArray(dto.moduleIds) && dto.moduleIds.length > 0;

    return hasBundle !== hasModules;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreateOrderDto;
    const hasBundle = dto.bundleSlug !== undefined && dto.bundleSlug !== null;

    return hasBundle
      ? 'Escolha o pacote ou os modulos, nunca os dois.'
      : 'Escolha o pacote ou ao menos um modulo.';
  }
}

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
 * Criacao do pedido. **Nao existe campo de preco nem de lote aqui**, e isso e a
 * decisao 2 da Spec 014: o valor e somado no servidor a partir de
 * `Module.priceCents` — ou, no pacote, do lote vigente que o servidor escolhe
 * na hora (Spec 019, decisao 5). Aceitar valor do navegador seria deixar o
 * comprador escolher quanto pagar.
 */
export class CreateOrderDto {
  // So fica de fora quando o pedido e de pacote e nao traz modulos: sem
  // `moduleIds` e sem `bundleSlug`, a restricao roda e recusa.
  @ValidateIf((dto: CreateOrderDto) => dto.moduleIds !== undefined || dto.bundleSlug === undefined)
  @Validate(OrderTargetConstraint)
  @IsString({ each: true, message: 'Cada modulo precisa ser um id.' })
  @ArrayMaxSize(50, { message: 'Modulos demais em um unico pedido.' })
  @ArrayUnique({ message: 'Modulo repetido no pedido.' })
  moduleIds?: string[];

  /** Pacote pelo slug (Spec 019). Exclusivo com `moduleIds`. */
  @IsOptional()
  @IsString({ message: 'Pacote invalido.' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Pacote invalido.' })
  @MaxLength(80)
  bundleSlug?: string;

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
