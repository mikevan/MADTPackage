/**
 * The release governance gate's view of the toolkit.
 *
 * **Build-time structural inspection, not a runtime dependency.** MADTPackage
 * owns release (rule 8), so the release governance test lives here. It reads
 * the three packages' product source from disk as text, through the
 * TypeScript compiler API, and never executes it. MADTPackage ships no
 * source, imports no product peer's private source, and remains not a
 * runtime backchannel between DeepTest and UntangleIt. Its one package
 * import, Witness, is development-time and through Witness's declared public
 * API.
 *
 * **Identity comes from resolved symbols, never from spelling.** That is the
 * whole reason this builds a real program rather than reading text. The plan
 * for this phase was wrong three times about the live tree, every time
 * because a name looked like something it was not: `RegExp.exec` read as
 * process execution, the asynchronous `node:fs` `writeFile` missed by a
 * `*Sync`-shaped list, and `vscode.workspace.fs.writeFile` counted as
 * `node:fs` because `fs.writeFile` is a substring of it. All three happened
 * in the plan. None reached this gate, because this gate asks the checker.
 *
 * **The root.** `POLYGLOT_GOVERNANCE_ROOT` names a governance fixture root
 * and is set by `release.ps1` only for a `-GovernanceOnly` verification run.
 * **Unset means the real toolkit**, resolved from this file's own location.
 * There is no default that points at a fixture.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

/** The packages the gate inspects, in the order `release.ps1` builds them. */
export const INSPECTED = ['complexity', 'Witness', 'DeepTest', 'UntangleIt'] as const;
export type InspectedPackage = (typeof INSPECTED)[number];

/** The three packages whose production source carries governance behaviour. */
export const GOVERNED: readonly InspectedPackage[] = ['Witness', 'DeepTest', 'UntangleIt'];

/**
 * The toolkit root this run inspects.
 *
 * Unset or empty environment variable means the real tree, two parents up
 * from this file. A fixture root is only ever supplied deliberately.
 */
export function toolkitRoot(): string {
  const override = process.env.POLYGLOT_GOVERNANCE_ROOT;
  if (override && override.trim().length > 0) {
    return path.resolve(override.trim());
  }
  return path.resolve(__dirname, '..', '..');
}

/** True when this run is inspecting a fixture rather than the real toolkit. */
export function isFixtureRun(): boolean {
  const override = process.env.POLYGLOT_GOVERNANCE_ROOT;
  return override !== undefined && override.trim().length > 0;
}

export interface PackageProgram {
  readonly name: InspectedPackage;
  readonly root: string;
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  /** Production source files only: under `src/`, excluding declarations. */
  readonly production: readonly ts.SourceFile[];
}

const cache = new Map<string, PackageProgram>();

/**
 * Builds a program for one package from that package's own `tsconfig.json`,
 * so the gate reads the program the typechecker reads.
 *
 * It throws rather than degrading. A gate that silently inspected an empty
 * program would be the worst possible failure: green, and about nothing.
 */
export function programFor(name: InspectedPackage, root = toolkitRoot()): PackageProgram {
  const key = `${root}::${name}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const dir = path.join(root, name);
  const configPath = path.join(dir, 'tsconfig.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`The release governance gate cannot inspect ${name}: ${configPath} is missing. Prepare the tree as the closure record describes.`);
  }
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) {
    throw new Error(`The release governance gate cannot read ${configPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`);
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dir);
  if (parsed.fileNames.length === 0) {
    throw new Error(`The release governance gate found no files for ${name} via ${configPath}. An empty program proves nothing.`);
  }
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
  const srcDir = path.join(dir, 'src') + path.sep;
  const production = program
    .getSourceFiles()
    .filter((f) => !f.isDeclarationFile && path.resolve(f.fileName).startsWith(srcDir));
  if (production.length === 0) {
    throw new Error(`The release governance gate found no production source under ${srcDir}. An empty program proves nothing.`);
  }
  const built: PackageProgram = { name, root: dir, program, checker: program.getTypeChecker(), production };
  cache.set(key, built);
  return built;
}

/** Every governed package's program, built once. */
export function governedPrograms(root = toolkitRoot()): readonly PackageProgram[] {
  return GOVERNED.map((n) => programFor(n, root));
}

/** A path normalized for reporting and for set equality: relative, forward slashes. */
export function rel(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

/** The package-relative path, prefixed by the package name. */
export function normalized(pkg: PackageProgram, file: ts.SourceFile): string {
  return `${pkg.name}/${rel(pkg.root, file.fileName)}`;
}

// ---------------------------------------------------------------------------
// Symbol resolution helpers. Every invariant that names an API uses these
// rather than matching text.
// ---------------------------------------------------------------------------

/** Walks every node in a source file. */
export function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

/** The symbol an identifier or property access resolves to, aliases followed. */
export function resolved(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol) {
    return undefined;
  }
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

/**
 * The module specifier an expression's root identifier was imported from.
 *
 * This is what makes `import * as f from 'node:fs'` then `f.writeFileSync`
 * the same fact as `fs.writeFileSync`, and what makes a property named
 * `writeFile` on an unrelated object not a `node:fs` write at all.
 */
export function moduleOfRoot(checker: ts.TypeChecker, expression: ts.Expression): string | undefined {
  let current: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current) || ts.isElementAccessExpression(current)) {
    current = ts.isCallExpression(current) ? current.expression : current.expression;
  }
  if (!ts.isIdentifier(current)) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(current);
  if (!symbol) {
    return undefined;
  }
  for (const declaration of symbol.declarations ?? []) {
    const specifier = importSpecifierOf(declaration);
    if (specifier) {
      return specifier;
    }
  }
  return undefined;
}

function importSpecifierOf(declaration: ts.Declaration): string | undefined {
  let node: ts.Node | undefined = declaration;
  while (node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      return node.moduleSpecifier.text;
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      return node.moduleReference.expression.text;
    }
    node = node.parent;
  }
  return undefined;
}

/** The dotted member path of a property access, e.g. `workspace.fs.writeFile`. */
export function memberPath(expression: ts.Expression): string {
  const parts: string[] = [];
  let current: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  return parts.join('.');
}

/** The enclosing function-like node, for the per-function proximity rules. */
export function enclosingFunction(node: ts.Node): ts.Node | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

/** A readable `file:line` for a failure message somebody has to act on. */
export function where(pkg: PackageProgram, node: ts.Node): string {
  const file = node.getSourceFile();
  const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
  return `${normalized(pkg, file)}:${line + 1}`;
}
