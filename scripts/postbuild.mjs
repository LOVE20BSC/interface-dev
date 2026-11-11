#!/usr/bin/env node
// GitHub Pages has no rewrite rules. Deep links are recovered with the standard
// 404.html trick: 404.html rewrites /repo/some/path into /repo/?/some/path, then
// the SPA boots and restores the real URL with history.replaceState.
import { existsSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const dist = resolve(root, 'dist');
const indexPath = resolve(dist, 'index.html');
if (!existsSync(indexPath)) {
  console.error('[postbuild] dist/index.html not found; run vite build first.');
  process.exit(1);
}

const rawBase = process.env.VITE_BASE ?? '/';
const base = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
const normalizedBase = base.endsWith('/') ? base : `${base}/`;
const segments = normalizedBase.split('/').filter(Boolean).length;

const buildId = readBuildId();

// 404.html intentionally stays tiny: loading the app shell from a 404 URL would
// run the router against a path the server could not resolve.
const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex, nofollow" />
    <title>LOVE20协议</title>
    <script>
      (function () {
        var segmentsToKeep = ${segments};
        var location = window.location;
        var path = location.pathname.split('/');
        var basePath = segmentsToKeep === 0 ? '' : path.slice(0, 1 + segmentsToKeep).join('/');
        var tail = path.slice(1 + segmentsToKeep).join('/');
        var search = location.search ? location.search.slice(1).replace(/&/g, '~and~') : '';
        var target =
          location.protocol +
          '//' +
          location.host +
          basePath +
          '/?/' +
          tail +
          (search ? '&' + search : '') +
          location.hash;
        location.replace(target);
      })();
    </script>
  </head>
  <body>
    <p style="font-family: system-ui, sans-serif; padding: 24px">
      正在打开 LOVE20协议… 如果没有自动跳转，请回到首页。
    </p>
    <a href="${normalizedBase}" style="font-family: system-ui, sans-serif; padding: 0 24px">返回首页</a>
  </body>
</html>
`;

writeFileSync(resolve(dist, '404.html'), html, 'utf8');
writeFileSync(resolve(dist, '.nojekyll'), '', 'utf8');
writeFileSync(
  resolve(dist, 'build-id.json'),
  `${JSON.stringify({ buildId: buildId ?? 'unknown', base: normalizedBase })}\n`,
  'utf8',
);

console.log(`[postbuild] 404.html (${segments} path segment(s) kept), .nojekyll, build-id.json`);

function readBuildId() {
  const idFile = resolve(root, '.build-id');
  if (existsSync(idFile)) {
    return readFileSync(idFile, 'utf8').trim();
  }
  const generated = resolve(root, 'src/config/build-id.generated.ts');
  if (existsSync(generated)) {
    const match = readFileSync(generated, 'utf8').match(/BUILD_ID = "([^"]+)"/);
    return match ? match[1] : undefined;
  }
  return undefined;
}
