import { IsIn } from 'class-validator';
import type { PublishChangeKind } from '../legal.types';

/** Tipos que o painel pode pedir. `INITIAL` e so da carga inicial. */
const PUBLISH_CHANGE_KINDS: PublishChangeKind[] = ['NEW_VERSION', 'CORRECTION'];

/** Publicacao do rascunho (Spec 022, decisao 3). */
export class PublishLegalDocumentDto {
  @IsIn(PUBLISH_CHANGE_KINDS, { message: 'Escolha entre nova versão e correção.' })
  changeKind!: PublishChangeKind;
}
