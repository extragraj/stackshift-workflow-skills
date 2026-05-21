import { readFileSync, statSync, readdirSync, existsSync } from 'fs';
import { join, relative, resolve, extname } from 'path';

/**
 * StackShift static validator.
 *
 * Reads `.stackshift/installed.json` to learn which protocols are active,
 * then runs static checks against `schemas/custom/**` and
 * `components/sections/<name>/index.tsx`. Reports violations as `file:line: message`.
 *
 * Exit codes:
 *   0  — no violations (or no marker; warnings only)
 *   1  — at least one `required`-tier violation
 *   0  — `recommended`-tier violations are surfaced as warnings (do not fail)
 *
 * Per-file mode (`--file <path>`) runs only the checks relevant to that path.
 * No-arg mode walks the full project.
 */

type Tier = 'required' | 'recommended' | 'optional';

interface InstalledJson {
  protocols?: Array<{ id: string; tier?: Tier }>;
}

interface Finding {
  file: string;
  line: number;
  protocolId: string;
  tier: Tier;
  message: string;
}

interface ValidateOptions {
  cwd: string;
  file?: string;
  json?: boolean;
}

const PROTOCOL_TIERS: Record<string, Tier> = {
  'factory-function-pattern': 'required',
  'sub-field-visibility': 'required',
  'variant-router': 'required',
  'variant-naming-convention': 'required',
  'one-time-custom-schema-setup': 'required',
  'field-reuse-first': 'recommended',
  'hide-if-variant': 'recommended',
  'preview-conventions': 'recommended',
  'array-layout': 'recommended',
  'section-directory-layout': 'recommended',
  'variant-reuse-first': 'recommended',
  'dynamic-variants-registry': 'recommended',
};

function readInstalled(cwd: string): InstalledJson | null {
  const markerPath = join(cwd, '.stackshift', 'installed.json');
  if (!existsSync(markerPath)) return null;
  try {
    return JSON.parse(readFileSync(markerPath, 'utf8')) as InstalledJson;
  } catch {
    return null;
  }
}

function activeProtocolIds(marker: InstalledJson | null): Set<string> {
  const ids = new Set<string>();
  if (!marker?.protocols) return ids;
  for (const p of marker.protocols) ids.add(p.id);
  return ids;
}

function tierFor(protocolId: string, marker: InstalledJson | null): Tier {
  const declared = marker?.protocols?.find((p) => p.id === protocolId)?.tier;
  return (declared ?? PROTOCOL_TIERS[protocolId] ?? 'recommended') as Tier;
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

function walk(dir: string, predicate: (p: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

// ---------- protocol checks ----------

/**
 * factory-function-pattern (required, Step 1):
 * Field factory functions in `schemas/custom/**\/common/fields.ts` return plain
 * object literals — they MUST NOT call `defineField()` / `defineType()` inside.
 * Sanity v3.17 + WebriQ schema-default treats factory output as plain objects;
 * calling `defineField` inside breaks `hideInVariants` at runtime.
 */
function checkFactoryFunctionPattern(file: string, source: string, findings: Finding[]): void {
  if (!file.replace(/\\/g, '/').includes('/common/fields.ts')) return;
  const re = /\bdefine(?:Field|Type)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    findings.push({
      file,
      line: lineOf(source, m.index),
      protocolId: 'factory-function-pattern',
      tier: 'required',
      message: `\`${m[0].replace(/\s*\($/, '()')}\` call found in factory file — factories return plain object literals, not Sanity define* helpers.`,
    });
  }
}

/**
 * sub-field-visibility (required, Step 1):
 * `hideInVariants` belongs on the sub-field, not on a duplicated top-level
 * field of the same name. We flag any line where a top-level field declaration
 * shares a name with another `name:` entry within the same file (cheap proxy
 * — exact same `name: 'foo'` appearing twice).
 */
function checkSubFieldVisibility(file: string, source: string, findings: Finding[]): void {
  if (!file.replace(/\\/g, '/').includes('/schemas/custom/')) return;
  if (!/sections\/[^/]+\//.test(file.replace(/\\/g, '/'))) return;
  const nameRe = /\bname:\s*['"]([a-zA-Z0-9_]+)['"]/g;
  const seen = new Map<string, number[]>();
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(source))) {
    const arr = seen.get(m[1]) ?? [];
    arr.push(m.index);
    seen.set(m[1], arr);
  }
  for (const [name, indices] of seen) {
    if (indices.length > 1) {
      for (let i = 1; i < indices.length; i++) {
        findings.push({
          file,
          line: lineOf(source, indices[i]),
          protocolId: 'sub-field-visibility',
          tier: 'required',
          message: `Duplicate field name "${name}" detected — duplicate \`name:\` at section level crashes schema load. Move \`hideInVariants\` onto the sub-field instead.`,
        });
      }
    }
  }
}

/**
 * variant-router (required, Step 4):
 * `components/sections/<name>/index.tsx` must:
 *   - export an interface ending in `Props`
 *   - use `?? undefined` (not `?? null` or bare optional chain) in prop extraction
 *   - return `null` when `Variant` is absent — no hardcoded fallback variant
 *   - take `{ data }: SectionsProps` as its function signature
 */
function checkVariantRouter(file: string, source: string, findings: Finding[]): void {
  const normalized = file.replace(/\\/g, '/');
  if (!/\/components\/sections\/[^/]+\/index\.tsx?$/.test(normalized)) return;

  const exportInterface = /export\s+interface\s+[A-Z]\w*Props\b/.test(source);
  if (!exportInterface) {
    findings.push({
      file,
      line: 1,
      protocolId: 'variant-router',
      tier: 'required',
      message: 'Missing `export interface <Name>Props` — ui-forge cannot consume the contract without it.',
    });
  }

  if (/\?\?\s*null\b/.test(source)) {
    const m = /\?\?\s*null\b/.exec(source)!;
    findings.push({
      file,
      line: lineOf(source, m.index),
      protocolId: 'variant-router',
      tier: 'required',
      message: 'Prop extraction uses `?? null` — variant-router requires `?? undefined` for every field.',
    });
  }

  if (!/if\s*\(\s*!\s*Variant\s*\)\s*return\s+null\s*;?/.test(source)) {
    findings.push({
      file,
      line: 1,
      protocolId: 'variant-router',
      tier: 'required',
      message: 'Missing `if (!Variant) return null;` fallback — never hardcode a default variant.',
    });
  }

  if (!/\{\s*data\s*\}\s*:\s*SectionsProps\b/.test(source)) {
    findings.push({
      file,
      line: 1,
      protocolId: 'variant-router',
      tier: 'required',
      message: 'Section function signature must be `({ data }: SectionsProps)` — not a custom props type.',
    });
  }
}

/**
 * variant-naming-convention (required, Step 4):
 * Two-letter variant keys (`variant_aa`, `variant_ab`, ...) are reserved for
 * after `variant_z` is exhausted. Flag any two-letter key in the `Variants`
 * map of a section's `index.tsx` when `variant_z` is not also present —
 * the agent skipped the single-letter sequence.
 *
 * Operates per-file. Scans every `variant_<key>:` declaration (the `Variants`
 * map key positions) and ignores other occurrences elsewhere in the file.
 */
function checkVariantNamingConvention(file: string, source: string, findings: Finding[]): void {
  const normalized = file.replace(/\\/g, '/');
  if (!/\/components\/sections\/[^/]+\/index\.tsx?$/.test(normalized)) return;

  const re = /\bvariant_([a-z]+)\s*:/g;
  const positions = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (!positions.has(m[1])) positions.set(m[1], m.index);
  }

  const keys = new Set(positions.keys());
  const twoLetter = Array.from(keys).filter((k) => k.length === 2);
  if (twoLetter.length === 0) return;
  // Post-`variant_z` two-letter keys are valid.
  if (keys.has('z')) return;

  const missingSingles: string[] = [];
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i);
    if (!keys.has(letter)) {
      missingSingles.push(letter);
      if (missingSingles.length >= 3) break;
    }
  }
  const hint = missingSingles[0] ?? 'a';

  for (const k of twoLetter) {
    findings.push({
      file,
      line: lineOf(source, positions.get(k)!),
      protocolId: 'variant-naming-convention',
      tier: 'required',
      message: `\`variant_${k}\` uses a two-letter key while \`variant_z\` is absent — two-letter suffixes only begin after \`variant_z\` is exhausted. Next single-letter key available: \`variant_${hint}\`.`,
    });
  }
}

/**
 * preview-conventions (recommended, Step 1):
 * Sections often define array-of-objects fields without a `preview.prepare()`.
 * Heuristic: a `type: 'array'` or `type: 'object'` block lacking a `preview:` key
 * within the same field definition.
 */
function checkPreviewConventions(file: string, source: string, findings: Finding[]): void {
  const normalized = file.replace(/\\/g, '/');
  if (!normalized.includes('/schemas/custom/')) return;
  const blockRe = /\{\s*name:\s*['"][^'"]+['"][^{}]*?type:\s*['"](array|object)['"][\s\S]*?\n\s{2,}\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(source))) {
    const block = m[0];
    if (block.length > 4000) continue;
    if (!/\bpreview\s*:/.test(block)) {
      findings.push({
        file,
        line: lineOf(source, m.index),
        protocolId: 'preview-conventions',
        tier: 'recommended',
        message: `\`type: '${m[1]}'\` field has no \`preview\` block — Sanity Studio will fall back to the raw object dump.`,
      });
    }
  }
}

// ---------- driver ----------

function runChecks(file: string, active: Set<string>, marker: InstalledJson | null): Finding[] {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const findings: Finding[] = [];
  if (active.has('factory-function-pattern')) checkFactoryFunctionPattern(file, source, findings);
  if (active.has('sub-field-visibility')) checkSubFieldVisibility(file, source, findings);
  if (active.has('variant-router')) checkVariantRouter(file, source, findings);
  if (active.has('variant-naming-convention')) checkVariantNamingConvention(file, source, findings);
  if (active.has('preview-conventions')) checkPreviewConventions(file, source, findings);
  // upgrade tier from marker, where present
  for (const f of findings) f.tier = tierFor(f.protocolId, marker);
  return findings;
}

function collectFiles(cwd: string, only?: string): string[] {
  if (only) return [resolve(cwd, only)];
  const targets: string[] = [];
  targets.push(...walk(join(cwd, 'schemas'), (p) => p.endsWith('.ts') && !p.endsWith('.d.ts')));
  targets.push(...walk(join(cwd, 'components', 'sections'), (p) => /index\.tsx?$/.test(p)));
  return targets;
}

function format(finding: Finding, cwd: string): string {
  const rel = relative(cwd, finding.file).replace(/\\/g, '/');
  const marker = finding.tier === 'required' ? 'error' : 'warn';
  return `${rel}:${finding.line}: ${marker}: [${finding.protocolId}] ${finding.message}`;
}

export async function validate(opts: ValidateOptions): Promise<number> {
  const cwd = opts.cwd;
  const marker = readInstalled(cwd);

  if (!marker) {
    console.error('⚠️  No `.stackshift/installed.json` found — run `npx @extragraj/stackshift-skills init` first.');
    return 0;
  }

  const active = activeProtocolIds(marker);
  if (active.size === 0) {
    console.error('⚠️  No active protocols in installed.json — nothing to validate.');
    return 0;
  }

  const files = collectFiles(cwd, opts.file);
  const findings: Finding[] = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    if (!/\.tsx?$/.test(extname(file)) && !file.endsWith('.tsx') && !file.endsWith('.ts')) continue;
    findings.push(...runChecks(file, active, marker));
  }

  if (opts.json) {
    const rel = (p: string) => relative(cwd, p).replace(/\\/g, '/');
    process.stdout.write(JSON.stringify(
      { findings: findings.map((f) => ({ ...f, file: rel(f.file) })) },
      null,
      2,
    ) + '\n');
  } else {
    for (const f of findings) console.log(format(f, cwd));
    if (findings.length === 0) console.log(`✓ ${files.length} file(s) checked — no protocol violations.`);
  }

  return findings.some((f) => f.tier === 'required') ? 1 : 0;
}

/**
 * Read Claude Code PostToolUse hook payload from stdin. Returns the
 * `tool_input.file_path` field or undefined if absent / unparseable.
 *
 * Claude Code PostToolUse hooks receive JSON on stdin of the shape:
 *   { "session_id": "...", "tool_name": "Edit",
 *     "tool_input": { "file_path": "/abs/path", ... }, ... }
 *
 * The previous implementation used a `$CLAUDE_FILE_PATH` env var that does not
 * exist in the documented hook contract — calls fell through to a project-wide
 * walk on every Write/Edit.
 */
async function readHookFilePath(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  return new Promise<string | undefined>((resolve) => {
    let buf = '';
    let resolved = false;
    const done = (v: string | undefined): void => {
      if (resolved) return;
      resolved = true;
      resolve(v);
    };
    // Safety timeout — if no stdin arrives in 500ms, give up rather than hang.
    const timer = setTimeout(() => done(undefined), 500);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => { buf += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      try {
        const obj = JSON.parse(buf || '{}') as { tool_input?: { file_path?: string } };
        const p = obj.tool_input?.file_path;
        done(typeof p === 'string' && p.length > 0 ? p : undefined);
      } catch {
        done(undefined);
      }
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      done(undefined);
    });
  });
}

/**
 * CLI entry — parsed from process.argv.
 * Supported flags: `--file <path>`, `--json`, `--hook`.
 *
 * `--hook` reads the Claude Code PostToolUse JSON payload from stdin and
 * extracts `tool_input.file_path`, then runs the same validation as
 * `--file <path>`. If stdin is empty or the path is missing, the hook exits
 * 0 without touching the project — Claude Code surfaces nothing.
 */
export async function runValidateCli(argv: string[]): Promise<void> {
  const opts: ValidateOptions = { cwd: process.cwd() };
  let hookMode = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' && i + 1 < argv.length) opts.file = argv[++i];
    else if (a === '--json') opts.json = true;
    else if (a === '--hook') hookMode = true;
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: npx @extragraj/stackshift-skills validate [--file <path>] [--json] [--hook]`);
      console.log(`Static protocol linter. Exits 1 on required-tier violations.`);
      console.log(``);
      console.log(`  --hook   Read Claude Code PostToolUse JSON from stdin and validate the`);
      console.log(`           file referenced by tool_input.file_path. Exits 0 if stdin is empty.`);
      process.exit(0);
    }
  }
  if (hookMode) {
    const filePath = await readHookFilePath();
    if (!filePath) {
      process.exit(0);
    }
    opts.file = filePath;
  }
  const code = await validate(opts);
  process.exit(code);
}
