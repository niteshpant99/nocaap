/**
 * src/core/chunker.ts
 * Converts markdown files into searchable chunks for Orama indexing
 */
import fs from 'fs-extra';
import matter from 'gray-matter';
import * as paths from '../utils/paths.js';
import { log } from '../utils/logger.js';

// =============================================================================
// Constants
// =============================================================================

/** Target chunk size in characters (~500 for Transformers.js compatibility) */
const TARGET_CHUNK_SIZE = 500;

/** Minimum chunk size to avoid tiny fragments */
const MIN_CHUNK_SIZE = 100;

// =============================================================================
// Types
// =============================================================================

export interface ChunkMetadata {
  title: string;
  summary?: string;
  type?: string;
  tags: string[];
}

export interface Chunk {
  /** Unique ID for this chunk */
  id: string;
  /** The text content of the chunk */
  content: string;
  /** Path to the source file relative to .context/ */
  path: string;
  /** Package alias this chunk belongs to */
  package: string;
  /** Heading hierarchy (e.g., ["Getting Started", "Installation"]) */
  headings: string[];
  /** Metadata extracted from frontmatter */
  metadata: ChunkMetadata;
}

export interface ChunkResult {
  chunks: Chunk[];
  fileCount: number;
  chunkCount: number;
}

// =============================================================================
// Markdown Parsing
// =============================================================================

/**
 * Extract heading hierarchy from heading line
 */
function parseHeading(line: string): { level: number; text: string } | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match || !match[1] || !match[2]) return null;
  return {
    level: match[1].length,
    text: match[2].trim(),
  };
}

/**
 * Split markdown content by H2 sections
 * Returns sections with their heading hierarchy
 */
function splitByH2Sections(
  body: string,
  documentTitle: string
): Array<{ headings: string[]; content: string }> {
  const lines = body.split('\n');
  const sections: Array<{ headings: string[]; content: string }> = [];

  let currentHeadings: string[] = [documentTitle];
  let currentContent: string[] = [];
  let h1Seen = false;

  for (const line of lines) {
    const heading = parseHeading(line);

    if (heading) {
      // Skip the first H1 as it's usually the document title
      if (heading.level === 1 && !h1Seen) {
        h1Seen = true;
        continue;
      }

      // On H2, save current section and start new one
      if (heading.level === 2) {
        if (currentContent.length > 0) {
          const content = currentContent.join('\n').trim();
          if (content.length >= MIN_CHUNK_SIZE) {
            sections.push({
              headings: [...currentHeadings],
              content,
            });
          }
        }
        currentHeadings = [documentTitle, heading.text];
        currentContent = [];
        continue;
      }

      // Track H3+ headings in hierarchy
      if (heading.level >= 3 && currentHeadings.length >= 2) {
        currentHeadings = [
          currentHeadings[0]!,
          currentHeadings[1]!,
          heading.text,
        ];
      }
    }

    currentContent.push(line);
  }

  // Don't forget the last section
  if (currentContent.length > 0) {
    const content = currentContent.join('\n').trim();
    if (content.length >= MIN_CHUNK_SIZE) {
      sections.push({
        headings: [...currentHeadings],
        content,
      });
    }
  }

  // If no sections were created, create one from entire content
  if (sections.length === 0 && body.trim().length >= MIN_CHUNK_SIZE) {
    sections.push({
      headings: [documentTitle],
      content: body.trim(),
    });
  }

  return sections;
}

/**
 * Further split a section if it exceeds target chunk size
 */
function splitLargeSection(
  section: { headings: string[]; content: string }
): Array<{ headings: string[]; content: string }> {
  if (section.content.length <= TARGET_CHUNK_SIZE) {
    return [section];
  }

  // Split by paragraphs (double newlines)
  const paragraphs = section.content.split(/\n\n+/);
  const chunks: Array<{ headings: string[]; content: string }> = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 2 > TARGET_CHUNK_SIZE) {
      if (currentChunk.trim().length >= MIN_CHUNK_SIZE) {
        chunks.push({
          headings: section.headings,
          content: currentChunk.trim(),
        });
      }
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length >= MIN_CHUNK_SIZE) {
    chunks.push({
      headings: section.headings,
      content: currentChunk.trim(),
    });
  }

  return chunks.length > 0 ? chunks : [section];
}

// =============================================================================
// Main Chunking Function
// =============================================================================

/**
 * Chunk a single markdown file into searchable pieces
 */
export async function chunkFile(
  filePath: string,
  packageAlias: string,
  contextDir: string
): Promise<Chunk[]> {
  const normalizedPath = paths.toUnix(filePath);
  const relativePath = paths.relative(contextDir, normalizedPath);

  log.debug(`Chunking file: ${relativePath}`);

  const fileContent = await fs.readFile(normalizedPath, 'utf-8');
  const { data: frontmatter, content: body } = matter(fileContent);

  // Extract metadata
  const title = extractTitle(frontmatter, body, normalizedPath);
  const summary = (frontmatter.summary ?? frontmatter.description) as string | undefined;
  const type = frontmatter.type as string | undefined;
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter((t): t is string => typeof t === 'string')
    : [];

  const metadata: ChunkMetadata = { title, summary, type, tags };

  // Split into sections
  const sections = splitByH2Sections(body, title);

  // Further split large sections
  const allChunks: Array<{ headings: string[]; content: string }> = [];
  for (const section of sections) {
    allChunks.push(...splitLargeSection(section));
  }

  // Convert to Chunk objects with unique IDs
  return allChunks.map((chunk, index) => ({
    id: `${relativePath}#${index}`,
    content: chunk.content,
    path: relativePath,
    package: packageAlias,
    headings: chunk.headings,
    metadata,
  }));
}

/**
 * Extract title from frontmatter, first H1, or filename
 */
function extractTitle(
  frontmatter: Record<string, unknown>,
  body: string,
  filePath: string
): string {
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }

  const h1Match = body.match(/^#\s+(.+)$/m);
  if (h1Match?.[1]) {
    return h1Match[1].trim();
  }

  const filename = paths.basename(filePath, paths.extname(filePath));
  return filename
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Chunk all markdown files in a package directory
 */
export async function chunkPackage(
  packagePath: string,
  packageAlias: string,
  contextDir: string
): Promise<Chunk[]> {
  const chunks: Chunk[] = [];

  if (!(await paths.exists(packagePath))) {
    log.debug(`Package path does not exist: ${packagePath}`);
    return chunks;
  }

  const files = await findMarkdownFiles(packagePath);

  for (const file of files) {
    try {
      const fileChunks = await chunkFile(file, packageAlias, contextDir);
      chunks.push(...fileChunks);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.debug(`Failed to chunk ${file}: ${message}`);
    }
  }

  return chunks;
}

/**
 * Recursively find all markdown files in a directory
 */
async function findMarkdownFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = paths.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      const subFiles = await findMarkdownFiles(fullPath);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      const ext = paths.extname(entry.name).toLowerCase();
      if (ext === '.md' || ext === '.mdx') {
        results.push(fullPath);
      }
    }
  }

  return results;
}
