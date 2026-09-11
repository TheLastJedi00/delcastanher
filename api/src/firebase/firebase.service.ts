import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, ServiceAccount, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Storage, getStorage } from 'firebase-admin/storage';

/** Nome dedicado do app, para nao colidir com o app default do Admin SDK. */
export const FIREBASE_APP_NAME = 'delcastanher-api';

/** Campos do JSON de service account que o Admin SDK exige. */
interface ServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

/**
 * Inicializa o Firebase Admin SDK a partir das credenciais ja presentes no
 * ambiente (`FIREBASE_SERVICE_ACCOUNT_JSON`) e centraliza o acesso ao `Auth`
 * e a chave web usada pela REST API do Firebase Auth.
 */
@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app?: App;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const existing = getApps().find(app => app.name === FIREBASE_APP_NAME);

    if (existing) {
      this.app = existing;
      return;
    }

    this.app = initializeApp({ credential: cert(this.serviceAccount()) }, FIREBASE_APP_NAME);
    this.logger.log('Firebase Admin SDK inicializado.');
  }

  /** Instancia de Auth do Admin SDK (verificacao de token, gestao de usuarios). */
  get auth(): Auth {
    if (!this.app) {
      throw new InternalServerErrorException(
        'Firebase Admin SDK ainda nao foi inicializado.',
      );
    }

    return getAuth(this.app);
  }

  /**
   * Instancia de Storage do Admin SDK. Irmao do `auth`: e por aqui que a API
   * assina as URLs de upload e download (Spec 010, decisao 2) — o front nunca
   * fala com o Firebase.
   */
  get storage(): Storage {
    if (!this.app) {
      throw new InternalServerErrorException(
        'Firebase Admin SDK ainda nao foi inicializado.',
      );
    }

    return getStorage(this.app);
  }

  /** Chave web do projeto, usada nas chamadas a REST API do Firebase Auth. */
  get webApiKey(): string {
    const key = this.config.get<string>('FIREBASE_WEB_API_KEY');

    if (!key) {
      throw new InternalServerErrorException('FIREBASE_WEB_API_KEY nao configurada.');
    }

    return key;
  }

  private serviceAccount(): ServiceAccount {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');

    if (!raw) {
      throw new InternalServerErrorException(
        'FIREBASE_SERVICE_ACCOUNT_JSON nao configurada.',
      );
    }

    let parsed: ServiceAccountJson;

    try {
      parsed = JSON.parse(raw) as ServiceAccountJson;
    } catch {
      throw new InternalServerErrorException(
        'FIREBASE_SERVICE_ACCOUNT_JSON nao contem um JSON valido.',
      );
    }

    const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = parsed;

    if (!projectId || !clientEmail || !privateKey) {
      throw new InternalServerErrorException(
        'FIREBASE_SERVICE_ACCOUNT_JSON precisa conter project_id, client_email e private_key.',
      );
    }

    return {
      projectId,
      clientEmail,
      // Alguns provedores de env escapam as quebras de linha da chave.
      privateKey: privateKey.replace(/\n/g, '\n'),
    };
  }
}
