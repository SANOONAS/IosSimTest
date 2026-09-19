import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

export const program = new Command();

program
  .name('kmp-sim')
  .description(pkg.description)
  .version(pkg.version);

program
  .command('up')
  .description('Push the project to GitHub and start a simulator stream')
  .option('-p, --platform <platform>', 'Platform to stream (ios/android)', 'android')
  .option('--public', 'Create a public repository (free GitHub Actions minutes)')
  .option('-m, --minutes <minutes>', 'How long to hold the stream open', '30')
  .option('--no-open', 'Do not open the stream URL automatically')
  .option('--repo <name>', 'Custom repository name')
  .option('--message <msg>', 'Custom commit message')
  .action(async (options) => {
    const { up } = await import('./commands/up.js');
    await up(process.cwd(), options);
  });

program
  .command('down')
  .description('Shut down active simulator streams')
  .option('--all', 'Cancel all in-flight kmp-sim runs for this repo')
  .action(async (options) => {
    const { down } = await import('./commands/down.js');
    await down(process.cwd(), options);
  });

program
  .command('status')
  .description('Check the status of the current simulator session')
  .action(async () => {
    const { status } = await import('./commands/status.js');
    await status(process.cwd());
  });

program
  .command('doctor')
  .description('Check if your environment is ready for kmp-sim')
  .action(async () => {
    const { doctor } = await import('./commands/doctor.js');
    await doctor(process.cwd());
  });

program
  .command('init')
  .description('Install the kmp-sim workflow into your project')
  .option('--force', 'Overwrite existing files')
  .action(async (options) => {
    const { init } = await import('./commands/init.js');
    await init(process.cwd(), options);
  });
