import { install } from './install.js';
import { repair } from './repair.js';
import { runValidateCli } from './validate.js';
import { showHelp } from './flags.js';

const [, , command, ...rest] = process.argv;

async function main(): Promise<void> {
  // Handle root-level --help only when no subcommand is supplied
  if (command === undefined && (process.argv.includes('--help') || process.argv.includes('-h'))) {
    showHelp();
    process.exit(0);
  }

  switch (command) {
    case 'init':
    case undefined:
      await install();
      break;
    case 'repair':
      await repair();
      break;
    case 'validate':
      await runValidateCli(rest);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('');
      showHelp();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
