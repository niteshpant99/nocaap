/**
 * src/core/indexer.ts
 * Generates the AI-optimized INDEX.md file
 */
import fs from 'fs-extra';
import matter from 'gray-matter';
import * as paths from '../utils/paths.js';
import { readConfig } from './config.js';
import { log } from '../utils/logger.js';

// =============================================================================
// Constants
// =============================================================================

/** Rough estimate: ~4 characters per token */
const CHARS_PER_TOKEN = 4;

/** Warning threshold for token budget */
const TOKEN_BUDGET_WARNING = 8000;

/** Maximum lines to extract for preview */
const MAX_PREVIEW_LINES = 5;

/** Supported documentation file extensions */
const DOC_EXTENSIONS = ['.md', '.mdx'];

// =============================================================================
// Types
// =============================================================================

export interface DocMeta {
  /** Document title (from frontmatter or filename) */
  title: string;
  /** Document summary (from frontmatter) */
  summary?: string;
  /** Document type (from frontmatter, e.g., "guide", "api") */
  type?: string;
  /** Document tags (from frontmatter) */
  tags?: string[];
  /** Path relative to .context/ directory */
  relativePath: string;
  /** Preview text (first 5 lines if no summary) */
  preview: string;
}

export interface IndexResult {
  /** The INDEX.md markdown content */
  content: string;
  /** Number of files indexed */
  fileCount: number;
  /** Approximate token count */
  tokenEstimate: number;
  /** Warnings (e.g., "Exceeds 8k token budget") */
  warnings: string[];
}

interface PackageIndex {
  alias: string;
  files: DocMeta[];
}

// =============================================================================
// File Parsing
// =============================================================================

/**
 * Parse a single documentation file and extract metadata
 */
export async function parseDocFile(filePath: string, basePath: string): Promise<DocMeta> {
  const normalizedPath = paths.toUnix(filePath);
  const relativePath = paths.relative(basePath, normalizedPath);

  log.debug(`Parsing doc file: ${relativePath}`);

  const content = await fs.readFile(normalizedPath, 'utf-8');

  // Parse frontmatter
  const { data: frontmatter, content: body } = matter(content);

  // Extract title: frontmatter > first H1 > filename
  const title = extractTitle(frontmatter, body, normalizedPath);

  // Extract summary from frontmatter (support both 'summary' and 'description')
  const summary = (frontmatter.summary ?? frontmatter.description) as string | undefined;

  // Extract type from frontmatter
  const type = frontmatter.type as string | undefined;

  // Extract tags from frontmatter
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter((t): t is string => typeof t === 'string')
    : undefined;

  // Generate preview: use summary or first N non-empty lines
  const preview = summary || extractPreview(body);

  return {
    title,
    summary,
    type,
    tags,
    relativePath,
    preview,
  };
}

/**
 * Extract title from frontmatter, first H1, or filename
 */
function extractTitle(
  frontmatter: Record<string, unknown>,
  body: string,
  filePath: string
): string {
  // 1. Try frontmatter title
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }

  // 2. Try first H1 heading
  const h1Match = body.match(/^#\s+(.+)$/m);
  if (h1Match?.[1]) {
    return h1Match[1].trim();
  }

  // 3. Fall back to filename (without extension)
  const filename = paths.basename(filePath, paths.extname(filePath));
  // Convert kebab-case or snake_case to Title Case
  return filename
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Extract preview from first N non-empty, non-heading lines
 * Truncates at word boundary for cleaner output
 */
function extractPreview(body: string): string {
  const lines = body.split('\n');
  const previewLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and headings
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Skip frontmatter delimiters
    if (trimmed === '---') {
      continue;
    }

    previewLines.push(trimmed);

    if (previewLines.length >= MAX_PREVIEW_LINES) {
      break;
    }
  }

  let preview = previewLines.join(' ');

  // Truncate at word boundary if too long
  if (preview.length > 300) {
    preview = preview.slice(0, 300);
    const lastSpace = preview.lastIndexOf(' ');
    // Don't truncate too aggressively (keep at least 200 chars)
    if (lastSpace > 200) {
      preview = preview.slice(0, lastSpace);
    }
    preview += '...';
  }

  return preview;
}

// =============================================================================
// Directory Scanning
// =============================================================================

/**
 * Recursively find all documentation files in a directory
 */
async function findDocFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  if (!(await paths.exists(dirPath))) {
    return results;
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = paths.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Skip hidden directories and node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      const subFiles = await findDocFiles(fullPath);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      const ext = paths.extname(entry.name).toLowerCase();
      if (DOC_EXTENSIONS.includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

// =============================================================================
// Index Generation
// =============================================================================

/**
 * Scan all packages and generate INDEX.md content
 */
export async function generateIndex(projectRoot: string): Promise<IndexResult> {
  const contextDir = paths.getContextDir(projectRoot);
  const warnings: string[] = [];

  log.debug(`Generating index for ${projectRoot}`);

  // Read config to get package aliases
  const config = await readConfig(projectRoot);
  if (!config || config.packages.length === 0) {
    log.debug('No packages configured, generating empty index');
    return {
      content: generateEmptyIndex(),
      fileCount: 0,
      tokenEstimate: 0,
      warnings: ['No packages configured'],
    };
  }

  // Scan each package directory
  const packageIndexes: PackageIndex[] = [];
  let totalFiles = 0;

  for (const pkg of config.packages) {
    const packagePath = paths.getPackagePath(projectRoot, pkg.alias);

    if (!(await paths.exists(packagePath))) {
      log.debug(`Package directory not found: ${pkg.alias}`);
      warnings.push(`Package '${pkg.alias}' directory not found`);
      continue;
    }

    const docFiles = await findDocFiles(packagePath);

    if (docFiles.length === 0) {
      log.debug(`No documentation files found in package: ${pkg.alias}`);
      warnings.push(`No .md/.mdx files found in '${pkg.alias}'`);
      continue;
    }

    // Parse each doc file
    const fileMetas: DocMeta[] = [];
    for (const filePath of docFiles) {
      try {
        const meta = await parseDocFile(filePath, contextDir);
        fileMetas.push(meta);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log.debug(`Failed to parse ${filePath}: ${message}`);
        warnings.push(`Failed to parse: ${paths.relative(contextDir, filePath)}`);
      }
    }

    // Sort files alphabetically by title
    fileMetas.sort((a, b) => a.title.localeCompare(b.title));

    packageIndexes.push({
      alias: pkg.alias,
      files: fileMetas,
    });

    totalFiles += fileMetas.length;
  }

  // Sort packages alphabetically
  packageIndexes.sort((a, b) => a.alias.localeCompare(b.alias));

  // Generate markdown content
  const content = generateIndexMarkdown(packageIndexes);

  // Estimate tokens
  const tokenEstimate = Math.ceil(content.length / CHARS_PER_TOKEN);

  // Check token budget
  if (tokenEstimate > TOKEN_BUDGET_WARNING) {
    warnings.push(
      `INDEX.md exceeds recommended token budget: ~${tokenEstimate.toLocaleString()} tokens ` +
        `(recommended: <${TOKEN_BUDGET_WARNING.toLocaleString()})`
    );
  }

  log.debug(
    `Index generated: ${totalFiles} files, ~${tokenEstimate.toLocaleString()} tokens`
  );

  return {
    content,
    fileCount: totalFiles,
    tokenEstimate,
    warnings,
  };
}

/**
 * Generate empty INDEX.md content
 */
function generateEmptyIndex(): string {
  const timestamp = new Date().toISOString();
  return `# Context Index

> Auto-generated by nocaap. Last updated: ${timestamp}

No packages configured. Run \`nocaap setup\` or \`nocaap add <repo>\` to add context packages.
`;
}

/**
 * Generate INDEX.md markdown from package indexes
 */
function generateIndexMarkdown(packages: PackageIndex[]): string {
  const timestamp = new Date().toISOString();

  const lines: string[] = [
    '# Context Index',
    '',
    `> Auto-generated by nocaap. Last updated: ${timestamp}`,
    '',
  ];

  // Add table of contents if multiple packages
  if (packages.length > 1) {
    lines.push('## Table of Contents');
    lines.push('');
    for (const pkg of packages) {
      // Create anchor-friendly ID (lowercase, hyphens)
      const anchorId = pkg.alias.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      lines.push(`- [${pkg.alias}](#${anchorId}) (${pkg.files.length} files)`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  for (const pkg of packages) {
    // Package header
    lines.push(`## ${pkg.alias} (${pkg.files.length} files)`);
    lines.push('');

    for (const file of pkg.files) {
      // File entry
      lines.push(`### ${file.title}`);
      lines.push('');
      lines.push(`**Path:** \`${file.relativePath}\``);

      if (file.type) {
        lines.push(`**Type:** ${file.type}`);
      }

      if (file.tags && file.tags.length > 0) {
        lines.push(`**Tags:** ${file.tags.join(', ')}`);
      }

      lines.push('');
      lines.push(file.preview);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// Index File Operations
// =============================================================================

/**
 * Generate and write INDEX.md file
 */
export async function writeIndex(projectRoot: string): Promise<IndexResult> {
  const result = await generateIndex(projectRoot);
  const indexPath = paths.getIndexPath(projectRoot);

  await fs.writeFile(indexPath, result.content, 'utf-8');
  log.debug(`Wrote INDEX.md to ${indexPath}`);

  return result;
}

/**
 * Read existing INDEX.md content
 */
export async function readIndex(projectRoot: string): Promise<string | null> {
  const indexPath = paths.getIndexPath(projectRoot);

  if (!(await paths.exists(indexPath))) {
    return null;
  }

  return fs.readFile(indexPath, 'utf-8');
}

/**
 * Generate and write INDEX.md with progress logging
 */
export async function generateIndexWithProgress(projectRoot: string): Promise<IndexResult> {
  log.info('Regenerating INDEX.md...');

  const result = await writeIndex(projectRoot);

  if (result.fileCount === 0) {
    log.warn('No documentation files found');
  } else {
    log.success(
      `Generated INDEX.md: ${result.fileCount} files, ~${result.tokenEstimate.toLocaleString()} tokens`
    );
  }

  // Log any warnings
  for (const warning of result.warnings) {
    log.warn(warning);
  }

  return result;
}
