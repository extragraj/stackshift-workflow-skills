import type { InstallChoices, ProtocolTier, ScopeChoice, Platform } from './prompts.js';
import { loadSeedRegistry } from './registry.js';

export interface Flags {
  tier?: 'required' | 'recommended' | 'full';
  scope?: 'project' | 'global';
  platforms?: Platform[];
  seed?: string;
  noInteractive?: boolean;
  help?: boolean;
}

/**
 * Parse command-line flags from process.argv
 * Supports:
 *   --tier <required|recommended|full>
 *   --scope <project|global>
 *   --platform <agents|claude|copilot|gemini|cursor|comma-separated>
 *   --seed <id>
 *   --no-interactive
 *   --help
 */
export function parseFlags(args: string[]): Flags {
  const flags: Flags = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        flags.help = true;
        break;

      case '--tier':
        if (i + 1 < args.length) {
          const tier = args[++i];
          if (tier === 'required' || tier === 'recommended' || tier === 'full') {
            flags.tier = tier;
          } else {
            console.error(`Invalid --tier value: ${tier}`);
            console.error('Valid values: required, recommended, full');
            process.exit(1);
          }
        }
        break;

      case '--scope':
        if (i + 1 < args.length) {
          const scope = args[++i];
          if (scope === 'project' || scope === 'global') {
            flags.scope = scope;
          } else {
            console.error(`Invalid --scope value: ${scope}`);
            console.error('Valid values: project, global');
            process.exit(1);
          }
        }
        break;

      case '--platform':
        if (i + 1 < args.length) {
          const platformArg = args[++i];
          const platforms = platformArg.split(',');
          const validPlatforms: Platform[] = [];
          const valid: Platform[] = ['agents', 'claude', 'copilot', 'gemini', 'cursor'];

          for (const p of platforms) {
            if (valid.includes(p as Platform)) {
              validPlatforms.push(p as Platform);
            } else {
              console.error(`Invalid --platform value: ${p}`);
              console.error('Valid values: agents, claude, copilot, gemini, cursor (or comma-separated)');
              process.exit(1);
            }
          }

          flags.platforms = validPlatforms;
        }
        break;

      case '--seed':
        if (i + 1 < args.length) {
          flags.seed = args[++i];
        }
        break;

      case '--no-materialize':
        // Removed in 0.3.0. The CLI is now the single source of truth for
        // bootstrap; there is no deferred-to-agent install path.
        console.error('Error: --no-materialize was removed in 0.3.0.');
        console.error('The CLI now performs the full bootstrap on install — no deferred mode.');
        process.exit(1);
        break;

      case '--no-interactive':
        flags.noInteractive = true;
        break;

      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown flag: ${arg}`);
          showHelp();
          process.exit(1);
        }
    }
  }

  return flags;
}

/**
 * Check if non-interactive mode is active
 */
export function isNonInteractive(flags: Flags): boolean {
  return flags.noInteractive === true;
}

/**
 * Validate flags and convert to InstallChoices
 * Returns null if validation fails
 */
export function validateFlags(flags: Flags): InstallChoices | null {
  const tier = flags.tier || 'recommended';
  const scope: ScopeChoice = flags.scope || 'project';
  const platforms: Platform[] = flags.platforms || ['agents'];

  // Validate --seed against the registry. 'none' is always valid; an unknown
  // id was previously written straight into installed.json and only surfaced
  // later by `repair`. Reject upfront in non-interactive mode.
  const seed = flags.seed ?? 'none';
  if (seed !== 'none') {
    const knownSeeds = loadSeedRegistry().map((s) => s.id);
    if (!knownSeeds.includes(seed)) {
      console.error(`Invalid --seed value: ${seed}`);
      const list = knownSeeds.length > 0 ? knownSeeds.join(', ') : '(none registered)';
      console.error(`Valid values: none, ${list}`);
      return null;
    }
  }

  return {
    protocolTier: tier as ProtocolTier,
    customProtocols: [],
    seed,
    scope,
    platforms,
  };
}

/**
 * Show help text
 */
export function showHelp(): void {
  console.log(`
StackShift CLI - Install StackShift skills for composable Sanity page-builder

USAGE:
  npx @extragraj/stackshift-skills init [OPTIONS]
  npx @extragraj/stackshift-skills repair

COMMANDS:
  init      Install StackShift skills (default)
  repair    Reconcile materialized protocols and seed state
  validate  Lint schemas + section index.tsx for protocol violations (exits 1 on required-tier hits)

OPTIONS:
  --tier <required|recommended|full>    Protocol tier (default: recommended)
  --scope <project|global>              Install location (default: project)
  --platform <platform>                 Platform(s) (default: agents)
                                        Values: claude, agents, copilot, gemini, cursor
                                        Use comma-separated for multiple: claude,agents
  --seed <id|none>                      Seeding strategy id, or 'none' (default: none)
                                        Example: --seed initialvalue-seeding
  --no-interactive                      Skip prompts, use flags + defaults
  --help, -h                            Show this help

PLATFORM SKILL ROOTS:
  claude    Claude Code         .claude/skills/         ~/.claude/skills/
  copilot   GitHub Copilot      .github/skills/         ~/.copilot/skills/
  agents    OpenAI Codex / All  .agents/skills/         ~/.agents/skills/
  gemini    Google Gemini       .agents/skills/         ~/.gemini/antigravity/skills/
  cursor    Cursor IDE          .cursor/skills/         ~/.cursor/skills/

EXAMPLES:
  # Interactive installation (recommended)
  npx @extragraj/stackshift-skills init

  # Non-interactive with defaults
  npx @extragraj/stackshift-skills init --no-interactive

  # Non-interactive with specific options
  npx @extragraj/stackshift-skills init --tier full --scope project --platform agents --no-interactive

  # Install to multiple platforms
  npx @extragraj/stackshift-skills init --platform claude,agents --no-interactive

  # Reconcile materialized state
  npx @extragraj/stackshift-skills repair

  # Lint a single file (for PreToolUse hooks)
  npx @extragraj/stackshift-skills validate --file schemas/custom/.../sections/hero/schema/index.ts

  # Lint the whole project, JSON output (for CI)
  npx @extragraj/stackshift-skills validate --json

NOTES:
  - stackshift is always installed (required for workflow)
  - Custom tier selection requires interactive mode
  - Protocol tiers are cumulative (full includes recommended + required)
  - The CLI performs the full bootstrap end-to-end: protocol materialization,
    design/standards/ seeding, .forgeignore, and UI Forge integration.
  `);
}
