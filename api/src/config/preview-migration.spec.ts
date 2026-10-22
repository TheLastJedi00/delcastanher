import { PREVIEW_MIGRATE_COMMAND, runPreviewMigration } from './preview-migration';

/** Spec 029, decisao 4: migration no deploy so no preview. */
describe('runPreviewMigration', () => {
  it('roda o prisma migrate deploy no preview', () => {
    const exec = jest.fn();

    expect(runPreviewMigration({ VERCEL_ENV: 'preview' }, exec)).toBe(true);
    expect(exec).toHaveBeenCalledWith(PREVIEW_MIGRATE_COMMAND);
    expect(PREVIEW_MIGRATE_COMMAND).toBe('npx prisma migrate deploy');
  });

  // Em producao a migration continua manual e com autorizacao (Spec 027,
  // decisao 8): o build nunca a roda sozinho.
  it.each([{ VERCEL_ENV: 'production' }, { VERCEL_ENV: 'development' }, {}])(
    'nao roda nada fora do preview (%j)',
    (env) => {
      const exec = jest.fn();

      expect(runPreviewMigration(env, exec)).toBe(false);
      expect(exec).not.toHaveBeenCalled();
    },
  );

  it('deixa a falha da migration derrubar o build', () => {
    const exec = jest.fn(() => {
      throw new Error('migration falhou');
    });

    expect(() => runPreviewMigration({ VERCEL_ENV: 'preview' }, exec)).toThrow('migration falhou');
  });
});
