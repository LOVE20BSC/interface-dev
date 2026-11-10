import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite';
import { DEPLOYMENT_FILES, resolveVariant, type EnvVariant } from './src/config/variant';

function normalizeBase(raw: string | undefined): string {
  const value = (raw ?? '/').trim();
  if (value.length === 0 || value === '/') return '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

interface HtmlMetaOptions {
  readonly variant: EnvVariant;
  readonly base: string;
  readonly siteOrigin: string | undefined;
}

/**
 * Build-time head injection (ADR-0001):
 *  - non-prod builds are noindex; SPA routes are not indexable anyway
 *  - canonical / og:url need absolute URLs, which must be baked in at build time
 */
function htmlMetaPlugin(options: HtmlMetaOptions): Plugin {
  return {
    name: 'love20-html-meta',
    transformIndexHtml(html): { html: string; tags: HtmlTagDescriptor[] } {
      const tags: HtmlTagDescriptor[] = [];
      if (options.variant !== 'prod') {
        tags.push({
          tag: 'meta',
          attrs: { name: 'robots', content: 'noindex, nofollow' },
          injectTo: 'head-prepend',
        });
      }
      tags.push({
        tag: 'meta',
        attrs: { name: 'love20:variant', content: options.variant },
        injectTo: 'head',
      });
      if (options.siteOrigin !== undefined) {
        const origin = options.siteOrigin.replace(/\/$/, '');
        const url = `${origin}${options.base}`;
        tags.push(
          { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: url }, injectTo: 'head' },
          {
            tag: 'meta',
            attrs: { property: 'og:image', content: `${origin}${options.base}og.png` },
            injectTo: 'head',
          },
          {
            tag: 'meta',
            attrs: { property: 'og:image:width', content: '1200' },
            injectTo: 'head',
          },
          {
            tag: 'meta',
            attrs: { property: 'og:image:height', content: '630' },
            injectTo: 'head',
          },
          {
            tag: 'meta',
            attrs: { property: 'og:image:alt', content: 'LOVE20 身份优先的社区协作网络' },
            injectTo: 'head',
          },
        );
      }
      return { html, tags };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const variant = resolveVariant(env.VITE_ENV, mode);
  const base = normalizeBase(env.VITE_BASE);
  const siteOrigin = env.VITE_SITE_ORIGIN;
  const deploymentFile = DEPLOYMENT_FILES[variant];

  return {
    base,
    plugins: [react(), tailwindcss(), htmlMetaPlugin({ variant, base, siteOrigin })],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@deployments': fileURLToPath(
          new URL(`./src/config/deployments/${deploymentFile}`, import.meta.url),
        ),
      },
    },
    build: {
      target: 'es2022',
      minify: 'terser',
      terserOptions: {
        compress: {
          passes: 3,
          pure_getters: true,
          unsafe: true,
          unsafe_arrows: true,
          unsafe_methods: true,
        },
        mangle: true,
        format: { comments: false },
      },
      sourcemap: false,
      reportCompressedSize: true,
      chunkSizeWarningLimit: 700,
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
    },
  };
});
