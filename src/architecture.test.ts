import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = resolve(process.cwd(), 'src');
const LAYERS = [
  'app',
  'pages',
  'widgets',
  'features',
  'entities',
  'shared',
  'domain',
  'config',
] as const;
type Layer = (typeof LAYERS)[number];

const ALLOWED: Readonly<Record<Layer, readonly Layer[]>> = {
  app: LAYERS,
  pages: ['pages', 'widgets', 'features', 'entities', 'shared', 'domain', 'config'],
  widgets: ['widgets', 'features', 'entities', 'shared', 'domain', 'config'],
  features: ['features', 'entities', 'shared', 'domain', 'config'],
  entities: ['entities', 'shared', 'domain', 'config'],
  shared: ['shared', 'domain', 'config'],
  domain: ['domain'],
  config: ['config'],
};

interface SourceFile {
  readonly absolute: string;
  readonly relative: string;
  readonly layer: Layer;
  readonly content: string;
}

function walk(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = resolve(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) files.push(...walk(absolute));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(absolute);
  }
  return files;
}

function sourceFiles(): SourceFile[] {
  return walk(SRC)
    .filter((absolute) => !/\.test\.(ts|tsx)$/.test(absolute))
    .filter((absolute) => !absolute.includes(`${sep}test${sep}`))
    .map((absolute) => {
      const rel = relative(SRC, absolute).split(sep).join('/');
      const layer = rel.split('/')[0] as Layer;
      return { absolute, relative: rel, layer, content: readFileSync(absolute, 'utf8') };
    })
    .filter((file) => LAYERS.includes(file.layer));
}

const FILES = sourceFiles();

function importsOf(content: string): string[] {
  const specifiers = new Set<string>();
  const staticImport = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImport = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [staticImport, dynamicImport]) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.add(specifier);
    }
  }
  return [...specifiers];
}

function targetLayer(file: SourceFile, specifier: string): Layer | null {
  if (specifier === '@deployments') return 'config';
  if (specifier.startsWith('@/')) {
    const first = specifier.slice(2).split('/')[0];
    return LAYERS.includes(first as Layer) ? (first as Layer) : null;
  }
  if (specifier.startsWith('.')) {
    const absolute = resolve(dirname(file.absolute), specifier);
    const rel = relative(SRC, absolute);
    if (rel.startsWith('..') || rel.startsWith(sep)) return null;
    const first = rel.split(sep)[0];
    return LAYERS.includes(first as Layer) ? (first as Layer) : null;
  }
  return null;
}

describe('dependency direction', () => {
  it('enforces app → pages → widgets → features → entities → shared (+ domain/config)', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const specifier of importsOf(file.content)) {
        const target = targetLayer(file, specifier);
        if (target === null) continue;
        if (!ALLOWED[file.layer].includes(target)) {
          violations.push(`${file.relative}: ${file.layer} imports ${target} via "${specifier}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps src/domain free of React, browser globals and chain SDKs', () => {
    const domainFiles = FILES.filter((file) => file.layer === 'domain');
    expect(domainFiles.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of domainFiles) {
      const code = file.content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const specifier of importsOf(code)) {
        if (
          specifier === 'react' ||
          specifier.startsWith('react/') ||
          specifier === 'react-dom' ||
          specifier.startsWith('react-dom/') ||
          specifier === 'wagmi' ||
          specifier.startsWith('wagmi/') ||
          specifier === 'viem' ||
          specifier.startsWith('viem/') ||
          specifier.startsWith('@tanstack/')
        ) {
          violations.push(`${file.relative}: forbidden import "${specifier}"`);
        }
      }
      for (const pattern of [/\bwindow\b/, /\bdocument\b/, /\blocation\b/, /\bReact\b/]) {
        if (pattern.test(code)) {
          violations.push(`${file.relative}: forbidden identifier ${String(pattern)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('storage boundary', () => {
  it('only src/shared/lib/cache.ts references localStorage or sessionStorage', () => {
    const violations = FILES.filter((file) => {
      if (file.relative === 'shared/lib/cache.ts') return false;
      const code = file.content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      return /\blocalStorage\b|\bsessionStorage\b/.test(code);
    }).map((file) => file.relative);
    expect(violations).toEqual([]);
  });

  it('the only cache module is actually present', () => {
    expect(FILES.some((file) => file.relative === 'shared/lib/cache.ts')).toBe(true);
  });
});

/**
 * i18n door rail. No i18n library yet, so the cheap invariant is that every
 * Chinese user-facing string lives in one of two reviewed files. Tests are
 * excluded by sourceFiles(); comments and identifiers are not literals.
 */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_ALLOWED = new Set(['shared/config/copy.ts', 'config/errors.generated.ts']);

interface CjkLiteral {
  readonly line: number;
  readonly text: string;
}

function cjkLiterals(content: string, filename: string): CjkLiteral[] {
  const source = ts.createSourceFile(
    filename,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const hits: CjkLiteral[] = [];
  const record = (node: ts.Node, text: string): void => {
    if (!CJK.test(text)) return;
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    hits.push({ line: position.line + 1, text: text.trim().slice(0, 80) });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      record(node, node.text);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      record(node, node.text);
    } else if (ts.isJsxText(node)) {
      record(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

describe('i18n discipline', () => {
  it('keeps every CJK string literal inside copy.ts or the generated error copy', () => {
    const violations = FILES.filter((file) => !CJK_ALLOWED.has(file.relative)).flatMap((file) =>
      cjkLiterals(file.content, file.relative).map(
        (hit) => `${file.relative}:${hit.line}: ${hit.text}`,
      ),
    );
    expect(violations).toEqual([]);
  });
});
