// The `node:` members the gate resolves, hand written so the fixture root
// needs no `npm ci`.
declare module 'node:fs' {
  export function writeFileSync(p: string, body: string, enc?: string): void;
  export function writeFile(p: string, body: string, cb: () => void): void;
  export function appendFileSync(p: string, body: string, enc?: string): void;
  export function readFileSync(p: string, enc?: string): string;
  export function existsSync(p: string): boolean;
  export function mkdirSync(p: string, o?: { recursive?: boolean }): void;
  export function openSync(p: string, mode: string): number;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
}
declare module 'node:child_process' {
  export function spawn(cmd: string, args: string[], o?: unknown): unknown;
}
