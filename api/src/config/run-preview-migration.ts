import { execSync } from 'node:child_process';
import { runPreviewMigration } from './preview-migration';

/**
 * Ponto de entrada do `vercel-build` (Spec 029, decisao 4). Roda depois do
 * `nest build`, e so mexe no banco quando `VERCEL_ENV=preview`.
 */
const ran = runPreviewMigration(process.env, (command) => {
  execSync(command, { stdio: 'inherit' });
});

console.log(
  ran
    ? 'Migrations aplicadas no banco de preview.'
    : `Sem migration no build (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'ausente'}).`,
);
