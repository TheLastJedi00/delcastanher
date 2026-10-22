import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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
    // Spec 030: o modulo de teste e um terceiro alvo, exclusivo com os outros.
    const hasTest = dto.testKey !== undefined && dto.testKey !== null;

    return [hasBundle, hasModules, hasTest].filter(Boolean).length === 1;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreateOrderDto;
    const hasBundle = dto.bundleSlug !== undefined && dto.bundleSlug !== null;

    if (dto.testKey !== undefined && dto.testKey !== null) {
      return 'O modulo de teste e comprado sozinho.';
    }

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

/** Etapas do navegador em que uma falha impede a cobranca (Spec 028, decisao 9). */
export const CLIENT_ERROR_STAGES = ['sdk_load', 'secure_fields', 'tokenize'] as const;

/**
 * Falha do navegador que impediu gerar o token do cartao (Spec 028, decisao
 * 9). Vai no lugar do `card`: o pedido nasce `FAILED`, sem chamar o Mercado
 * Pago, e e assim que a tentativa aparece no painel.
 */
export class OrderClientErrorDto {
  @IsIn(CLIENT_ERROR_STAGES, { message: 'Etapa do erro invalida.' })
  stage!: (typeof CLIENT_ERROR_STAGES)[number];

  @IsString({ message: 'Mensagem do erro ausente.' })
  @IsNotEmpty({ message: 'Mensagem do erro ausente.' })
  @MaxLength(300)
  message!: string;
}

/** As 27 UFs, para a NF-e nao sair com uma sigla que a Sefaz recusa. */
export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

/** Remove espacos das pontas; string vazia vira `undefined`. */
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/**
 * Endereco do destinatario da NF-e (Spec 023, decisao A3). O comprador digita
 * CEP, numero e complemento; logradouro, bairro, cidade, UF e codigo IBGE vem
 * do ViaCEP no navegador, e logradouro e bairro podem ser corrigidos. O
 * endereco e declaracao do comprador, como o nome: a API valida o formato, e
 * nao consulta o ViaCEP de novo.
 */
export class OrderAddressDto {
  /** So digitos: a mascara e da tela. */
  @Matches(/^\d{8}$/, { message: 'Informe um CEP válido.' })
  zip!: string;

  @Transform(trim)
  @IsString({ message: 'Informe o logradouro.' })
  @IsNotEmpty({ message: 'Informe o logradouro.' })
  @MaxLength(120)
  street!: string;

  @Transform(trim)
  @IsString({ message: 'Informe o número.' })
  @IsNotEmpty({ message: 'Informe o número.' })
  @MaxLength(20)
  number!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  complement?: string;

  @Transform(trim)
  @IsString({ message: 'Informe o bairro.' })
  @IsNotEmpty({ message: 'Informe o bairro.' })
  @MaxLength(80)
  district!: string;

  @Transform(trim)
  @IsString({ message: 'Informe a cidade.' })
  @IsNotEmpty({ message: 'Informe a cidade.' })
  @MaxLength(80)
  city!: string;

  /** A NF-e identifica o municipio pelo codigo IBGE, e nao pelo nome. */
  @Matches(/^\d{7}$/, { message: 'Cidade sem código IBGE. Confira o CEP.' })
  cityIbge!: string;

  @IsIn(BRAZILIAN_STATES, { message: 'UF inválida.' })
  state!: string;
}

/**
 * Pagador. O CPF e obrigatorio para PIX e melhora a aprovacao no cartao
 * (decisao 15) — e por ser dado novo na plataforma, entrou na Politica de
 * Privacidade. Desde a Spec 023 ele e gravado no pedido, com o endereco: a
 * NF-e nao sai sem os dois (decisao A3).
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

  @IsDefined({ message: 'Informe o endereço.' })
  @ValidateNested()
  @Type(() => OrderAddressDto)
  address!: OrderAddressDto;
}

/**
 * Criacao do pedido. **Nao existe campo de preco nem de lote aqui**, e isso e a
 * decisao 2 da Spec 014: o valor e somado no servidor a partir de
 * `Module.priceCents` — ou, no pacote, do lote vigente que o servidor escolhe
 * na hora (Spec 019, decisao 5). Aceitar valor do navegador seria deixar o
 * comprador escolher quanto pagar.
 */
export class CreateOrderDto {
  // So fica de fora quando o pedido traz exatamente um entre pacote e chave
  // do teste (Spec 030), e nenhum modulo. Sem nenhum alvo, a restricao roda e
  // recusa.
  @ValidateIf(
    (dto: CreateOrderDto) =>
      dto.moduleIds !== undefined || (dto.bundleSlug === undefined) === (dto.testKey === undefined),
  )
  @Validate(OrderTargetConstraint)
  @IsString({ each: true, message: 'Cada modulo precisa ser um id.' })
  @ArrayMaxSize(50, { message: 'Modulos demais em um unico pedido.' })
  @ArrayUnique({ message: 'Modulo repetido no pedido.' })
  moduleIds?: string[];

  /**
   * Chave do link secreto do modulo de teste (Spec 030). Exclusiva com
   * `moduleIds` e `bundleSlug`; o valor e o do servidor (R$ 1,00).
   */
  @IsOptional()
  @IsString({ message: 'Chave do teste invalida.' })
  @MaxLength(64)
  testKey?: string;

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

  /**
   * Clique em pagar que gerou o pedido (Spec 028, decisao 9): liga o pedido
   * aos logs do navegador da mesma tentativa.
   */
  @IsOptional()
  @IsUUID('4', { message: 'Tentativa invalida.' })
  attemptId?: string;

  /** Falha do navegador no lugar do `card` (Spec 028, decisao 9). */
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderClientErrorDto)
  clientError?: OrderClientErrorDto;
}
