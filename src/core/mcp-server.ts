/**
 * src/core/mcp-server.ts
 * MCP server implementation for AI agent access to organizational context
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs-extra';
import { z } from 'zod';
import { SearchEngine, searchIndexExists } from './search-engine.js';
import { readConfig } from './config.js';
import { readIndex } from './indexer.js';
import * as paths from '../utils/paths.js';

// =============================================================================
// Types
// =============================================================================

export interface McpServerOptions {
  projectRoot: string;
}

// =============================================================================
// MCP Server Factory
// =============================================================================

/**
 * Create and configure the nocaap MCP server
 */
export async function createMcpServer(options: McpServerOptions): Promise<McpServer> {
  const { projectRoot } = options;
  const contextDir = paths.getContextDir(projectRoot);

  // Initialize search engine
  const searchEngine = new SearchEngine();
  const hasIndex = await searchIndexExists(projectRoot);
  if (hasIndex) {
    await searchEngine.loadIndex(projectRoot);
  }

  // Create MCP server
  const server = new McpServer({
    name: 'nocaap',
    version: '1.0.0',
  });

  // ==========================================================================
  // Resources
  // ==========================================================================

  // INDEX.md resource - the AI-optimized context index
  server.registerResource(
    'index',
    'nocaap://index',
    {
      title: 'Context Index',
      description: 'AI-optimized index of all installed context packages',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const indexContent = await readIndex(projectRoot);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/markdown',
          text: indexContent ?? 'No INDEX.md found. Run `nocaap update` to generate.',
        }],
      };
    }
  );

  // Manifest resource - installed packages metadata
  server.registerResource(
    'manifest',
    'nocaap://manifest',
    {
      title: 'Package Manifest',
      description: 'Metadata about installed context packages',
      mimeType: 'application/json',
    },
    async (uri) => {
      const config = await readConfig(projectRoot);
      const manifest = {
        packages: config?.packages ?? [],
        searchIndexAvailable: hasIndex,
        packagesPath: paths.getPackagesDir(projectRoot),
      };
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(manifest, null, 2),
        }],
      };
    }
  );

  // ==========================================================================
  // Tools
  // ==========================================================================

  // Search tool - BM25 full-text search across all content
  server.registerTool(
    'search',
    {
      title: 'Search Context',
      description: 'Full-text search across all context packages using BM25 ranking',
      inputSchema: {
        query: z.string().describe('Search query'),
        packages: z.array(z.string()).optional().describe('Filter to specific packages'),
        tags: z.array(z.string()).optional().describe('Filter by document tags'),
        limit: z.number().optional().describe('Maximum results (default: 10)'),
      },
    },
    async ({ query, packages, tags, limit }) => {
      if (!searchEngine.isInitialized()) {
        return {
          content: [{
            type: 'text',
            text: 'Search index not available. Run `nocaap index` to build it.',
          }],
        };
      }

      const results = await searchEngine.search({
        query,
        packages,
        tags,
        limit: limit ?? 10,
      });

      const formattedResults = results.map((r, i) => ({
        rank: i + 1,
        path: r.path,
        package: r.package,
        title: r.title,
        headings: r.headings,
        score: r.score,
        snippet: r.content.slice(0, 200) + (r.content.length > 200 ? '...' : ''),
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(formattedResults, null, 2),
        }],
      };
    }
  );

  // Get document tool - retrieve full document content
  server.registerTool(
    'get_document',
    {
      title: 'Get Document',
      description: 'Retrieve the full content of a document by path',
      inputSchema: {
        path: z.string().describe('Relative path to document (from search results)'),
      },
    },
    async ({ path: docPath }) => {
      // Normalize and validate path
      const normalizedPath = paths.toUnix(docPath);
      const fullPath = paths.join(contextDir, normalizedPath);

      // Security check: ensure path is within context dir
      if (!paths.isWithin(contextDir, fullPath)) {
        return {
          content: [{
            type: 'text',
            text: `Error: Path is outside context directory`,
          }],
        };
      }

      if (!(await paths.exists(fullPath))) {
        return {
          content: [{
            type: 'text',
            text: `Document not found: ${docPath}`,
          }],
        };
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      return {
        content: [{
          type: 'text',
          text: content,
        }],
      };
    }
  );

  // Get section tool - retrieve a specific section by heading
  server.registerTool(
    'get_section',
    {
      title: 'Get Section',
      description: 'Retrieve a specific section from a document by heading',
      inputSchema: {
        path: z.string().describe('Relative path to document'),
        heading: z.string().describe('The heading text to find'),
      },
    },
    async ({ path: docPath, heading }) => {
      const normalizedPath = paths.toUnix(docPath);
      const fullPath = paths.join(contextDir, normalizedPath);

      if (!paths.isWithin(contextDir, fullPath)) {
        return {
          content: [{
            type: 'text',
            text: `Error: Path is outside context directory`,
          }],
        };
      }

      if (!(await paths.exists(fullPath))) {
        return {
          content: [{
            type: 'text',
            text: `Document not found: ${docPath}`,
          }],
        };
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      const section = extractSection(content, heading);

      if (!section) {
        return {
          content: [{
            type: 'text',
            text: `Section not found: "${heading}"`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: section,
        }],
      };
    }
  );

  // List contexts tool - list installed packages
  server.registerTool(
    'list_contexts',
    {
      title: 'List Contexts',
      description: 'List all installed context packages',
      inputSchema: {
        tags: z.array(z.string()).optional().describe('Filter by tags (not yet implemented)'),
      },
    },
    async () => {
      const config = await readConfig(projectRoot);

      if (!config || config.packages.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No context packages installed.',
          }],
        };
      }

      const packages = config.packages.map((pkg) => ({
        alias: pkg.alias,
        source: pkg.source,
        path: pkg.path ?? '/',
        version: pkg.version ?? 'main',
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(packages, null, 2),
        }],
      };
    }
  );

  return server;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract a section from markdown content by heading
 */
function extractSection(content: string, heading: string): string | null {
  const lines = content.split('\n');
  const headingLower = heading.toLowerCase();

  let capturing = false;
  let captureLevel = 0;
  const sectionLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim().toLowerCase();

      if (capturing) {
        // Stop if we hit a heading of same or higher level
        if (level <= captureLevel) {
          break;
        }
      } else if (text === headingLower) {
        // Start capturing from this heading
        capturing = true;
        captureLevel = level;
      }
    }

    if (capturing) {
      sectionLines.push(line);
    }
  }

  return sectionLines.length > 0 ? sectionLines.join('\n') : null;
}

// =============================================================================
// Server Runner
// =============================================================================

/**
 * Start the MCP server with stdio transport
 */
export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const server = await createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
