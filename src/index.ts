/**
 * src/index.ts
 * nocaap CLI entry point
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { addCommand } from './commands/add.js';
import { updateCommand } from './commands/update.js';
import { listCommand } from './commands/list.js';
import { removeCommand } from './commands/remove.js';
import { configCommand } from './commands/config.js';
import { pushCommand } from './commands/push.js';
import { serveCommand } from './commands/serve.js';
import { indexSearchCommand } from './commands/index-search.js';
import { generateIndexWithProgress } from './core/indexer.js';
import { log } from './utils/logger.js';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

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
  .version(pkg.version);

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
// Config Command
// =============================================================================

program
  .command('config [key] [value]')
  .description('Manage global nocaap configuration')
  .option('-l, --list', 'Show all configuration')
  .option('--clear', 'Clear the specified config key')
  .action(async (key, value, options) => {
    try {
      await configCommand(key, value, {
        list: options.list,
        clear: options.clear,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      process.exit(1);
    }
  });

// =============================================================================
// Push Command
// =============================================================================

program
  .command('push [alias]')
  .description('Push local changes to upstream as a PR')
  .option('-m, --message <message>', 'Commit message')
  .option('-a, --all', 'Push all packages with changes')
  .action(async (alias, options) => {
    try {
      await pushCommand(alias, {
        message: options.message,
        all: options.all,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      process.exit(1);
    }
  });

// =============================================================================
// Index Command
// =============================================================================

program
  .command('index')
  .description('Build INDEX.md and search index for AI agent access')
  .option('--semantic', 'Enable semantic search with vector embeddings')
  .option(
    '--provider <provider>',
    'Embedding provider: ollama | openai | tfjs | auto',
    'auto'
  )
  .action(async (options) => {
    try {
      const projectRoot = process.cwd();
      // Generate INDEX.md first
      await generateIndexWithProgress(projectRoot);
      // Then build search index (with optional semantic)
      await indexSearchCommand({
        semantic: options.semantic,
        provider: options.provider,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      process.exit(1);
    }
  });

// =============================================================================
// Serve Command
// =============================================================================

program
  .command('serve')
  .description('Start the MCP server for AI agent access')
  .option('--print-config', 'Print Claude Desktop configuration JSON')
  .option('--root <path>', 'Project root directory (default: current directory)')
  .action(async (options) => {
    try {
      await serveCommand({ printConfig: options.printConfig, root: options.root });
    } catch (error) {
      // IMPORTANT: Use stderr for errors in serve command
      // MCP uses stdout for JSON-RPC, so any stdout output corrupts the protocol
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// =============================================================================
// Parse and Execute
// =============================================================================

program.parse();
