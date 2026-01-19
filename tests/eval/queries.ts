/**
 * Search Quality Evaluation Query Bank
 *
 * These queries test against the synthetic Acme Labs corpus in tests/fixtures/.
 * This allows the evaluation to run without proprietary data.
 *
 * For local testing with real data, use: npm run test:eval:local
 */

export interface EvalQuery {
  /** Unique identifier for tracking */
  id: string;
  /** The search query */
  query: string;
  /** Expected path of the #1 result (regex pattern) */
  expectedTop: RegExp;
  /** Paths that MUST appear in top 5 */
  mustAppearInTop5?: RegExp[];
  /** Paths that should NOT appear in top 3 (known bad results) */
  mustNotAppearInTop3?: RegExp[];
  /** Category for reporting */
  category: 'core' | 'edge' | 'regression';
  /** Description of what this tests */
  description: string;
}

/**
 * Core queries - MUST pass for release
 */
export const CORE_QUERIES: EvalQuery[] = [
  // Company/Identity queries
  {
    id: 'Q1',
    query: 'What is Acme Labs?',
    expectedTop: /acme-identity\/(about|README)\.md/,
    category: 'core',
    description: 'Company overview query',
  },
  {
    id: 'Q2',
    query: 'Who is the CTO?',
    expectedTop: /team\.md/,
    mustAppearInTop5: [/team\.md/],
    category: 'core',
    description: 'Leadership query - tests semantic understanding',
  },
  // Product queries
  {
    id: 'Q3',
    query: 'What products does Acme have?',
    expectedTop: /acme-products\/README\.md/,
    category: 'core',
    description: 'Product listing - tests path + README boost',
  },
  {
    id: 'Q4',
    query: 'Tell me about Widget Pro',
    expectedTop: /widget-pro\.md/,
    category: 'core',
    description: 'Specific product query',
  },
  {
    id: 'Q5',
    query: 'Which products are in production?',
    expectedTop: /acme-products\/(README|widget-pro)\.md/,
    category: 'core',
    description: 'Status-based query',
  },
  // Project queries
  {
    id: 'Q6',
    query: 'What projects is Acme working on?',
    expectedTop: /acme-projects\/README\.md/,
    mustNotAppearInTop3: [/colors\.md/],
    category: 'core',
    description: 'Project listing - tests path boost over keyword noise',
  },
  {
    id: 'Q7',
    query: 'Tell me about Project Phoenix',
    expectedTop: /project-phoenix\.md/,
    category: 'core',
    description: 'Specific project query',
  },
];

/**
 * Edge case queries - SHOULD pass
 */
export const EDGE_QUERIES: EvalQuery[] = [
  {
    id: 'E1',
    query: 'color system',
    expectedTop: /colors\.md/,
    category: 'edge',
    description: 'Design system query',
  },
  {
    id: 'E2',
    query: 'past completed projects',
    expectedTop: /acme-past-projects/,
    category: 'edge',
    description: 'Historical projects query',
  },
  {
    id: 'E3',
    query: 'cloud architecture migration',
    expectedTop: /project-phoenix\.md/,
    category: 'edge',
    description: 'Concept-based query - tests semantic search',
  },
  {
    id: 'E4',
    query: 'enterprise pricing',
    expectedTop: /widget-pro\.md/,
    category: 'edge',
    description: 'Business concept in specific doc',
  },
  {
    id: 'E5',
    query: 'typography fonts',
    expectedTop: /typography\.md/,
    category: 'edge',
    description: 'Design system typography query',
  },
];

/**
 * Regression queries - added after bug fixes
 */
export const REGRESSION_QUERIES: EvalQuery[] = [
  {
    id: 'BUG-001',
    query: 'What projects does Acme have?',
    expectedTop: /projects/,
    mustNotAppearInTop3: [/colors\.md/],
    category: 'regression',
    description: 'BM25 keyword blindness - colors should not appear for projects query',
  },
];

/** All queries combined */
export const ALL_QUERIES: EvalQuery[] = [
  ...CORE_QUERIES,
  ...EDGE_QUERIES,
  ...REGRESSION_QUERIES,
];

/** Thresholds for pass/fail */
export const THRESHOLDS = {
  /** Minimum accuracy@1 to pass */
  minAccuracyAt1: 0.70,
  /** Minimum MRR to pass */
  minMRR: 0.65,
  /** Core queries must have this accuracy */
  coreAccuracy: 0.75,
};
