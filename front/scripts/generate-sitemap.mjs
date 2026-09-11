/**
 * Gera o `sitemap.xml` a partir das rotas que o build realmente prerenderizou
 * (Spec 009, Task 4.5).
 *
 * A fonte e o `prerendered-routes.json` do proprio build, e nao uma lista
 * escrita a mao: um sitemap mantido manualmente passa a mentir no dia em que
 * alguem adiciona uma rota — e sitemap que aponta para URL inexistente custa
 * confianca com o rastreador.
 *
 * O que fica de fora sao as rotas que declaram `noindex` em `app.routes.ts`:
 * pedir indexacao no sitemap e recusa-la na meta tag seria mandar dois sinais
 * contraditorios.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = join(import.meta.dirname, '..', 'dist', 'delcastanher-front');
// Mesma variavel que alimenta o canonical no app (ver scripts/apply-env.mjs):
// sitemap e canonical divergentes mandariam o rastreador para dois lugares.
const ORIGIN = process.env.SITE_ORIGIN ?? 'https://delcastanher.vercel.app';

/** Espelha as rotas com `indexable: false` em `core/services/seo-route.ts`. */
const NOT_INDEXABLE = ['/login'];

const manifest = JSON.parse(await readFile(join(DIST, 'prerendered-routes.json'), 'utf8'));

const urls = Object.keys(manifest.routes ?? {})
  .filter(route => !NOT_INDEXABLE.includes(route))
  .sort();

if (urls.length === 0) {
  throw new Error('Nenhuma rota prerenderizada encontrada — o sitemap ficaria vazio.');
}

const lastmod = new Date().toISOString().slice(0, 10);

const body = urls
  .map(route => {
    const loc = route === '/' ? ORIGIN : `${ORIGIN}${route}`;
    // A home e a vitrine mudam mais que um documento legal; a prioridade
    // apenas ordena entre as proprias paginas do site.
    const priority = route === '/' ? '1.0' : route.startsWith('/cursos/') ? '0.9' : '0.6';

    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
  })
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

await writeFile(join(DIST, 'browser', 'sitemap.xml'), xml, 'utf8');

// O `robots.txt` vai versionado em `public/`, mas a linha `Sitemap:` precisa
// acompanhar a origem configurada — apontar para um dominio antigo faria o
// rastreador buscar um sitemap que nao existe mais.
const robotsPath = join(DIST, 'browser', 'robots.txt');
const robots = await readFile(robotsPath, 'utf8');

await writeFile(
  robotsPath,
  robots.replace(/^Sitemap: .*$/m, `Sitemap: ${ORIGIN}/sitemap.xml`),
  'utf8'
);

console.log(`sitemap.xml gerado com ${urls.length} URLs em ${ORIGIN}.`);
