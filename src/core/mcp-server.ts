/**
 * src/core/mcp-server.ts
 * MCP server implementation for AI agent access to organizational context
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs-extra';
import { z } from 'zod';
import { SearchEngine, searchIndexExists, type SearchMode } from './search-engine.js';
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
      description:
        'Complete index of organizational knowledge with document summaries. ' +
        'Includes team directory, product specs, engineering docs, and company strategy.',
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
      description: 'Configuration showing installed knowledge packages and their sources.',
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

  // Search tool - supports fulltext, semantic, and hybrid modes
  server.registerTool(
    'search',
    {
      title: 'Search Context',
      description:
        'Search organizational knowledge including team directory, product documentation, ' +
        'engineering guidelines, company strategy, and project context. ' +
        'Use for questions about people, products, processes, or internal information. ' +
        'Returns ranked results with snippets - use get_document for full content.',
      inputSchema: {
        query: z.string().describe('Search query'),
        mode: z.enum(['fulltext', 'semantic', 'hybrid']).optional()
          .describe('Search mode (default: fulltext, or hybrid if vector index exists)'),
        packages: z.array(z.string()).optional().describe('Filter to specific packages'),
        tags: z.array(z.string()).optional().describe('Filter by document tags'),
        limit: z.number().optional().describe('Maximum results (default: 10)'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async ({ query, mode, packages, tags, limit }) => {
      if (!searchEngine.isInitialized()) {
        return {
          content: [{
            type: 'text',
            text: 'Search index not available. Run `nocaap index` to build it.',
          }],
        };
      }

      // Determine search mode - default to hybrid if vector search is available
      const searchMode: SearchMode = mode ?? (searchEngine.hasVectorSearch() ? 'hybrid' : 'fulltext');

      try {
        const results = await searchEngine.hybridSearch({
          query,
          mode: searchMode,
          packages,
          limit: limit ?? 10,
        });

        const formattedResults = results.map((r, i) => ({
          rank: i + 1,
          path: r.path,
          package: r.package,
          title: r.title,
          headings: r.headings,
          score: r.score,
          sources: r.sources,
          snippet: r.content.slice(0, 200) + (r.content.length > 200 ? '...' : ''),
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              mode: searchMode,
              vectorSearchAvailable: searchEngine.hasVectorSearch(),
              results: formattedResults,
            }, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{
            type: 'text',
            text: `Search error: ${message}`,
          }],
        };
      }
    }
  );

  // Get document tool - retrieve full document content
  server.registerTool(
    'get_document',
    {
      title: 'Get Document',
      description:
        'Retrieve full documentation by path (from search results). ' +
        'Use after searching to get complete details about team members, products, ' +
        'engineering decisions, or any organizational knowledge.',
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
      description:
        'Retrieve a specific section from a document by heading. ' +
        'Useful for extracting targeted information like "Key Accomplishments" or ' +
        '"Technical Architecture" without loading the entire document.',
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
      description:
        'List available knowledge domains and packages. ' +
        'Shows what organizational context is installed (team info, products, engineering docs, etc.). ' +
        'Use to discover what information is available before searching.',
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

  // Get overview tool - returns the full INDEX.md for context discovery
  server.registerTool(
    'get_overview',
    {
      title: 'Get Context Overview',
      description:
        'Get a structured overview of all available organizational knowledge. ' +
        'Returns package names, document titles, and content summaries. ' +
        'RECOMMENDED: Call this first to understand what context is available before searching.',
      inputSchema: {},
    },
    async () => {
      const indexContent = await readIndex(projectRoot);
      if (!indexContent) {
        return {
          content: [{
            type: 'text',
            text: 'No context index available. Run `nocaap index` to generate.',
          }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: indexContent,
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
