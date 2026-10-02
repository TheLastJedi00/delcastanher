import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/**
 * "Emitir de novo" (Spec 023, decisao A9). Em `UNKNOWN`, a confirmacao
 * explicita de que nao existe nota para o pedido no painel da Notaas
 * (decisao A2).
 */
export class ReissueInvoiceDto {
  @IsOptional()
  @IsBoolean({ message: 'A confirmacao precisa ser verdadeira ou falsa.' })
  confirmNoInvoice?: boolean;
}

/** "Vincular nota existente": o `invoiceId` visto no painel da Notaas. */
export class LinkInvoiceDto {
  @Transform(trim)
  @IsString({ message: 'Informe o invoiceId da Notaas.' })
  @IsNotEmpty({ message: 'Informe o invoiceId da Notaas.' })
  @MaxLength(100)
  invoiceId!: string;
}
