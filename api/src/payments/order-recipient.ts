import type { OrderPayerDto } from './dto/create-order.dto';

/**
 * Destinatario da NF-e, nas colunas do pedido (Spec 023, decisao A3).
 *
 * Um tipo e uma funcao so para os dois caminhos de criacao — modulos avulsos
 * no `OrdersService` e pacote no `BundlesService` —, para que nenhum dos dois
 * grave o endereco pela metade.
 */
export interface OrderRecipient {
  payerDocument: string;
  payerName: string;
  payerZip: string;
  payerStreet: string;
  payerNumber: string;
  payerComplement: string | null;
  payerDistrict: string;
  payerCity: string;
  payerCityIbge: string;
  payerState: string;
}

/** O pagador do checkout como o pedido o grava. */
export function toOrderRecipient(payer: OrderPayerDto): OrderRecipient {
  const address = payer.address;

  return {
    payerDocument: payer.document,
    payerName: `${payer.firstName.trim()} ${payer.lastName.trim()}`.trim(),
    payerZip: address.zip,
    payerStreet: address.street,
    payerNumber: address.number,
    // Complemento ausente e nulo, e nao texto vazio: a nota omite o campo.
    payerComplement: address.complement?.trim() || null,
    payerDistrict: address.district,
    payerCity: address.city,
    payerCityIbge: address.cityIbge,
    payerState: address.state,
  };
}
