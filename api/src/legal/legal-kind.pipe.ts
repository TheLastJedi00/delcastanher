import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { LEGAL_DOCUMENT_KINDS, LegalDocumentKind } from './legal.types';

/**
 * `kind` da URL, em minusculas (`terms`, `privacy`, `cookies`), para o enum do
 * banco (Spec 022). Qualquer outra coisa — inclusive a forma em maiusculas — e
 * 400: a URL tem uma grafia so.
 */
@Injectable()
export class ParseLegalKindPipe implements PipeTransform<string, LegalDocumentKind> {
  transform(value: string): LegalDocumentKind {
    const kind = LEGAL_DOCUMENT_KINDS.find((item) => item.toLowerCase() === value);

    if (!kind) {
      throw new BadRequestException('Documento desconhecido. Use terms, privacy ou cookies.');
    }

    return kind;
  }
}
