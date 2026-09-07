import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';

const mockCert = jest.fn();
const mockInitializeApp = jest.fn();
const mockGetApps = jest.fn();
const mockGetAuth = jest.fn();

jest.mock('firebase-admin/app', () => ({
  cert: (...args: unknown[]) => mockCert(...args),
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApps: () => mockGetApps(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
}));

// Importado depois dos mocks para que o modulo resolva as versoes mockadas.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FirebaseService, FIREBASE_APP_NAME } = require('./firebase.service') as typeof import('./firebase.service');

const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'delcastanher-test',
  private_key_id: 'abc123',
  private_key: '-----BEGIN PRIVATE KEY-----\nLINHA1\nLINHA2\n-----END PRIVATE KEY-----\n',
  client_email: 'sa@delcastanher-test.iam.gserviceaccount.com',
};

async function build(env: Record<string, string | undefined>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      FirebaseService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
    ],
  }).compile();

  return moduleRef.get(FirebaseService);
}

describe('FirebaseService', () => {
  const fakeApp = { name: FIREBASE_APP_NAME };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetApps.mockReturnValue([]);
    mockInitializeApp.mockReturnValue(fakeApp);
    mockCert.mockImplementation((sa: unknown) => ({ __cert: sa }));
  });

  describe('inicializacao', () => {
    it('inicializa o Admin SDK com as credenciais vindas do ambiente', async () => {
      const service = await build({
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT),
        FIREBASE_WEB_API_KEY: 'web-key',
      });

      service.onModuleInit();

      expect(mockCert).toHaveBeenCalledTimes(1);
      expect(mockCert).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: SERVICE_ACCOUNT.project_id,
          clientEmail: SERVICE_ACCOUNT.client_email,
          privateKey: SERVICE_ACCOUNT.private_key,
        }),
      );
      expect(mockInitializeApp).toHaveBeenCalledWith(
        { credential: { __cert: expect.anything() } },
        FIREBASE_APP_NAME,
      );
    });

    it('normaliza quebras de linha escapadas na private_key', async () => {
      const escaped = {
        ...SERVICE_ACCOUNT,
        private_key: '-----BEGIN PRIVATE KEY-----\nLINHA1\n-----END PRIVATE KEY-----\n',
      };
      const service = await build({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(escaped) });

      service.onModuleInit();

      expect(mockCert).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey: '-----BEGIN PRIVATE KEY-----\nLINHA1\n-----END PRIVATE KEY-----\n',
        }),
      );
    });

    it('reaproveita o app ja inicializado em vez de criar outro', async () => {
      mockGetApps.mockReturnValue([fakeApp]);
      const service = await build({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT) });

      service.onModuleInit();

      expect(mockInitializeApp).not.toHaveBeenCalled();
    });

    it('falha quando FIREBASE_SERVICE_ACCOUNT_JSON nao esta definida', async () => {
      const service = await build({});

      expect(() => service.onModuleInit()).toThrow(InternalServerErrorException);
    });

    it('falha quando FIREBASE_SERVICE_ACCOUNT_JSON nao e um JSON valido', async () => {
      const service = await build({ FIREBASE_SERVICE_ACCOUNT_JSON: '{nao-e-json' });

      expect(() => service.onModuleInit()).toThrow(InternalServerErrorException);
    });

    it('falha quando o JSON do service account esta incompleto', async () => {
      const service = await build({
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'x' }),
      });

      expect(() => service.onModuleInit()).toThrow(InternalServerErrorException);
    });
  });

  describe('auth', () => {
    it('expoe a instancia de Auth do app inicializado', async () => {
      const authInstance = { verifyIdToken: jest.fn() };
      mockGetAuth.mockReturnValue(authInstance);
      const service = await build({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT) });
      service.onModuleInit();

      expect(service.auth).toBe(authInstance);
      expect(mockGetAuth).toHaveBeenCalledWith(fakeApp);
    });

    it('falha quando acessada antes da inicializacao', async () => {
      const service = await build({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT) });

      expect(() => service.auth).toThrow(InternalServerErrorException);
    });
  });

  describe('webApiKey', () => {
    it('retorna a chave web configurada', async () => {
      const service = await build({ FIREBASE_WEB_API_KEY: 'web-key' });

      expect(service.webApiKey).toBe('web-key');
    });

    it('falha quando a chave web nao esta configurada', async () => {
      const service = await build({});

      expect(() => service.webApiKey).toThrow(InternalServerErrorException);
    });
  });
});
