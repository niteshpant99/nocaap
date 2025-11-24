#!/usr/bin/env node
/**
 * src/index.ts
 * nocaap CLI entry point
 */
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { addCommand } from './commands/add.js';
import { updateCommand } from './commands/update.js';
import { listCommand } from './commands/list.js';
import { removeCommand } from './commands/remove.js';
import { generateIndexWithProgress } from './core/indexer.js';
import { log } from './utils/logger.js';

// =============================================================================
// CLI Setup
// =============================================================================

const program = new Command();

program
  .name('nocaap')
  .description(
    'Normalized Organizational Context-as-a-Package\n\n' +
      'Standardize your AI agent context across teams.\n' +
      'Run `nocaap setup` to get started.'
  )
  .version('0.1.0');

// =============================================================================
// Setup Command
// =============================================================================

program
  .command('setup')
  .description('Interactive setup wizard to configure context packages')
  .option('-r, --registry <url>', 'Registry URL to fetch contexts from')
  .action(async (options) => {
    try {
      await setupCommand({ registry: options.registry });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      process.exit(1);
    }
  });

// =============================================================================
// Add Command
// =============================================================================

program
  .command('add <repo>')
  .description('Add a context package from a Git repository')
  .option('-p, --path <path>', 'Sparse checkout path within the repo')
  .option('-a, --alias <name>', 'Local alias for the package')
  .option('-b, --branch <branch>', 'Branch or tag to checkout', 'main')
  .action(async (repo, options) => {
    try {
      await addCommand(repo, {
        path: options.path,
        alias: options.alias,
        branch: options.branch,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      process.exit(1);
    }
  });

// =============================================================================
// Update Command
// =============================================================================

program
  .command('update [alias]')
  .description('Update context packages and regenerate index')
  .option('--force', 'Force update even if clean')
  .action(async (alias, options) => {
    try {
      await updateCommand(alias, { force: options.force });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      process.exit(1);
    }
  });

// =============================================================================
// List Command
// =============================================================================

program
  .command('list')
  .alias('ls')
  .description('List installed context packages')
  .action(async () => {
    try {
      await listCommand();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      process.exit(1);
    }
  });

// =============================================================================
// Remove Command
// =============================================================================

program
  .command('remove <alias>')
  .alias('rm')
  .description('Remove a context package')
  .option('--force', 'Force removal even if dirty')
  .action(async (alias, options) => {
    try {
      await removeCommand(alias, { force: options.force });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      process.exit(1);
    }
  });

// =============================================================================
// Generate Command
// =============================================================================

program
  .command('generate')
  .alias('index')
  .description('Regenerate INDEX.md without updating packages')
  .action(async () => {
    try {
      const projectRoot = process.cwd();
      await generateIndexWithProgress(projectRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      process.exit(1);
    }
  });

// =============================================================================
// Parse and Execute
// =============================================================================

program.parse();
