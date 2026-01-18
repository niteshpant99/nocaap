/**
 * src/commands/serve.ts
 * Start the nocaap MCP server
 */
import { startMcpServer } from '../core/mcp-server.js';
import * as paths from '../utils/paths.js';

// =============================================================================
// Types
// =============================================================================

export interface ServeOptions {
  printConfig?: boolean;
  root?: string;
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
  // Use --root option if provided, otherwise use current working directory
  const projectRoot = options.root ?? process.cwd();

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

  // Note: Don't output anything to stdout - MCP uses stdio for JSON-RPC communication
  // Any console.log() calls will corrupt the protocol
  // Warnings can go to stderr if absolutely necessary

  // Start the MCP server (blocks until terminated)
  await startMcpServer({ projectRoot });
}
