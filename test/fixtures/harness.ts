/**
 * Builds a one-file program over a fixture source, with self-contained
 * `vscode` and node declarations, so a control fails for its own reason and
 * needs no prepared `node_modules`.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as ts from 'typescript';
import type { PackageProgram } from '../program';

const TYPES = path.join(__dirname, 'ts', 'types');

/** Compiles `source` as `src/<name>` in a throwaway package and returns it shaped as a PackageProgram. */
export function fixtureProgram(name: string, source: string, pkgName = 'DeepTest'): PackageProgram {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-fixture-'));
  const root = path.join(dir, pkgName);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  const file = path.join(root, 'src', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, 'utf8');
  const program = ts.createProgram({
    rootNames: [file, path.join(TYPES, 'vscode.d.ts')],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      strict: false,
      noEmit: true,
      skipLibCheck: true,
      types: ['node'],
      typeRoots: [path.join(__dirname, '..', '..', 'node_modules', '@types')],
    },
  });
  const production = program.getSourceFiles().filter((f) => !f.isDeclarationFile && path.resolve(f.fileName).startsWith(path.join(root, 'src') + path.sep));
  return { name: pkgName as PackageProgram['name'], root, program, checker: program.getTypeChecker(), production };
}
