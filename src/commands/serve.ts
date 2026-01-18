/**
 * src/commands/serve.ts
 * Start the nocaap MCP server
 */
import { startMcpServer } from '../core/mcp-server.js';
import { searchIndexExists } from '../core/search-engine.js';
import * as paths from '../utils/paths.js';
import { log } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

export interface ServeOptions {
  printConfig?: boolean;
}

// =============================================================================
// Claude Desktop Config
// =============================================================================

interface ClaudeDesktopConfig {
  mcpServers: {
    [name: string]: {
      command: string;
      args: string[];
    };
  };
}

/**
 * Generate Claude Desktop configuration JSON
 */
function generateClaudeDesktopConfig(): ClaudeDesktopConfig {
  return {
    mcpServers: {
      nocaap: {
        command: 'nocaap',
        args: ['serve'],
      },
    },
  };
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Start the MCP server or print Claude Desktop config
 */
export async function serveCommand(options: ServeOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  // Handle --print-config flag
  if (options.printConfig) {
    const config = generateClaudeDesktopConfig();
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  // Check if .context directory exists
  const contextDir = paths.getContextDir(projectRoot);
  if (!(await paths.exists(contextDir))) {
    throw new Error(
      'No .context directory found. Run `nocaap setup` or `nocaap add` first.'
    );
  }

  // Check if search index exists
  const hasIndex = await searchIndexExists(projectRoot);
  if (!hasIndex) {
    log.warn('Search index not found. Run `nocaap index` for full-text search support.');
    log.info('Starting MCP server without search capabilities...');
  }

  // Start the MCP server (blocks until terminated)
  // Note: We don't use log.* here because stdio is used for MCP communication
  await startMcpServer({ projectRoot });
}
