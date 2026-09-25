import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mercadoPagoTokenKey } from '../config/payments.config';

/** Versao do formato gravado; muda se o algoritmo mudar. */
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
/** 12 bytes e o IV recomendado para GCM. */
const IV_BYTES = 12;

/**
 * Cifra os tokens do vendedor em repouso (Spec 020, decisao 4).
 *
 * `access_token` e `refresh_token` movimentam dinheiro de outra pessoa: um
 * vazamento do banco sozinho nao pode entrega-los. AES-256-GCM com IV
 * aleatorio por valor e a tag de autenticacao gravada junto, no formato
 * `v1.<iv>.<tag>.<cifrado>` (base64). A chave vive fora do banco, em
 * `MP_TOKEN_ENCRYPTION_KEY`.
 *
 * E o **unico** lugar que ve o token em claro fora da chamada ao Mercado
 * Pago. A chave e lida a cada uso, e nao no construtor: sem ela a API ainda
 * sobe, e so a loja fica fechada (decisao 7).
 */
@Injectable()
export class TokenCipher {
  constructor(private readonly config: ConfigService) {}

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, mercadoPagoTokenKey(this.config), iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

    return [VERSION, iv, cipher.getAuthTag(), body]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
      .join('.');
  }

  /** Falha com cifrado adulterado ou chave errada — nunca devolve lixo. */
  decrypt(encrypted: string): string {
    const [version, iv, tag, body] = encrypted.split('.');

    if (version !== VERSION || !iv || !tag || !body) {
      throw new Error('Token cifrado em formato desconhecido.');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      mercadoPagoTokenKey(this.config),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
