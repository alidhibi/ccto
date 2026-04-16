import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { walkProject } from '../walker.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function collect(root: string, config: Parameters<typeof walkProject>[1] = {}) {
  const files: string[] = [];
  for await (const f of walkProject(root, config)) {
    files.push(f.filepath);
  }
  return files;
}

describe('walkProject', () => {
  it('walks TypeScript files and detects language', async () => {
    const root = join(tmpdir(), `ccto-test-${Date.now()}`);
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'foo.ts'), 'export const x = 1;');
    writeFileSync(join(root, 'src', 'bar.js'), 'const y = 2;');
    writeFileSync(join(root, 'README.md'), '# hello');

    const files: import('../walker.js').WalkerFile[] = [];
    for await (const f of walkProject(root)) {
      files.push(f);
    }

    const langs = files.map((f) => f.language);
    expect(langs).toContain('typescript');
    expect(langs).toContain('javascript');

    rmSync(root, { recursive: true, force: true });
  });

  it('excludes node_modules by default', async () => {
    const root = join(tmpdir(), `ccto-test-excl-${Date.now()}`);
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'module.exports={}');
    writeFileSync(join(root, 'index.ts'), 'export {}');

    const files = await collect(root);
    const hasNodeModules = files.some((f) => f.includes('node_modules'));
    expect(hasNodeModules).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it('respects maxFileSizeBytes', async () => {
    const root = join(tmpdir(), `ccto-test-size-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'big.ts'), 'x'.repeat(100));
    writeFileSync(join(root, 'small.ts'), 'const a = 1;');

    const files = await collect(root, { maxFileSizeBytes: 50 });
    const names = files.map((f) => f.split(/[\\/]/).pop());
    expect(names).toContain('small.ts');
    expect(names).not.toContain('big.ts');

    rmSync(root, { recursive: true, force: true });
  });
});
