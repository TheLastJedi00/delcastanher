/** Comando que aplica as migrations pendentes no banco do ambiente. */
export const PREVIEW_MIGRATE_COMMAND = 'npx prisma migrate deploy';

/**
 * Aplica as migrations no deploy de preview (Spec 029, decisao 4).
 *
 * O preview tem banco proprio, uma branch do Neon, e cada release empurrada
 * para a branch `preview` traz as migrations dela. Em producao nada roda aqui:
 * a migration continua manual e com autorizacao (Spec 027, decisao 8).
 *
 * Uma falha sobe e derruba o build: publicar codigo novo sobre um banco sem a
 * migration dele daria erro em toda rota que tocasse a tabela nova.
 */
export function runPreviewMigration(
  env: Record<string, string | undefined>,
  exec: (command: string) => void,
): boolean {
  if (env.VERCEL_ENV !== 'preview') {
    return false;
  }

  exec(PREVIEW_MIGRATE_COMMAND);

  return true;
}
