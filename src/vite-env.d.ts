/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** dev | test | prod. The only environment switch (ADR-0002). */
  readonly VITE_ENV?: string;
  /** Build-time base path, e.g. / or /repo/. Baked into assets and the router. */
  readonly VITE_BASE?: string;
  /** Absolute site origin for canonical/og:url; optional in local builds. */
  readonly VITE_SITE_ORIGIN?: string;
  /** Dev-only RPC override (e.g. an anvil on a non-default port). */
  readonly VITE_ANVIL_RPC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
