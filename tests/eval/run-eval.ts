/**
 * Search Quality Evaluation Runner
 *
 * Usage:
 *   npx tsx tests/eval/run-eval.ts --fixtures         # Run against test fixtures (CI/contributors)
 *   npx tsx tests/eval/run-eval.ts                    # Run against real .context/ (local dev)
 *   npx tsx tests/eval/run-eval.ts --core             # Run core queries only
 *   npx tsx tests/eval/run-eval.ts --record-baseline  # Save results as baseline
 *   npx tsx tests/eval/run-eval.ts --compare-baseline # Compare against baseline
 */
import fs from 'fs-extra';
import path from 'path';
import { SearchEngine } from '../../src/core/search-engine.js';
import { ALL_QUERIES, CORE_QUERIES, THRESHOLDS, type EvalQuery } from './queries.js';

// Colors for terminal output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

interface QueryResult {
  id: string;
  query: string;
  passed: boolean;
  actualTop: string;
  expectedPattern: string;
  rank: number | null;
  top5: string[];
  violations: string[];
}

interface EvalResults {
  timestamp: string;
  mode: string;
  metrics: {
    total: number;
    passed: number;
    failed: number;
    accuracyAt1: number;
    mrr: number;
  };
  results: QueryResult[];
}

async function runEvaluation(queries: EvalQuery[], mode: 'hybrid' | 'fulltext', projectRoot: string): Promise<EvalResults> {
  const engine = new SearchEngine();

  const loaded = await engine.loadIndex(projectRoot);
  if (!loaded) {
    console.error(`${RED}Error: No search index found. Run: node dist/index.js index --semantic${RESET}`);
    process.exit(1);
  }

  const hasVector = engine.hasVectorSearch();
  const actualMode = mode === 'hybrid' && !hasVector ? 'fulltext' : mode;

  if (mode === 'hybrid' && !hasVector) {
    console.log(`${YELLOW}Warning: Vector search not available, falling back to fulltext${RESET}\n`);
  }

  const results: QueryResult[] = [];
  let reciprocalRankSum = 0;

  for (const q of queries) {
    const searchResults = await engine.hybridSearch({
      query: q.query,
      mode: actualMode,
      limit: 10,
    });

    const top5 = searchResults.slice(0, 5).map(r => r.path);
    const actualTop = searchResults[0]?.path || '(no results)';

    // Check if expected result matches
    const passedTop = q.expectedTop.test(actualTop);

    // Find rank of expected result
    let rank: number | null = null;
    for (let i = 0; i < searchResults.length; i++) {
      if (q.expectedTop.test(searchResults[i]!.path)) {
        rank = i + 1;
        break;
      }
    }

    // Check for violations (results that should NOT appear)
    const violations: string[] = [];
    if (q.mustNotAppearInTop3) {
      const top3 = searchResults.slice(0, 3).map(r => r.path);
      for (const badPattern of q.mustNotAppearInTop3) {
        for (const p of top3) {
          if (badPattern.test(p)) {
            violations.push(`${p} should not be in top 3`);
          }
        }
      }
    }

    // Check for required results
    if (q.mustAppearInTop5) {
      for (const requiredPattern of q.mustAppearInTop5) {
        const found = top5.some(p => requiredPattern.test(p));
        if (!found) {
          violations.push(`Expected ${requiredPattern} in top 5`);
        }
      }
    }

    const passed = passedTop && violations.length === 0;

    // Calculate reciprocal rank for MRR
    if (rank !== null) {
      reciprocalRankSum += 1 / rank;
    }

    results.push({
      id: q.id,
      query: q.query,
      passed,
      actualTop,
      expectedPattern: q.expectedTop.source,
      rank,
      top5,
      violations,
    });
  }

  const passedCount = results.filter(r => r.passed).length;
  const mrr = reciprocalRankSum / queries.length;

  return {
    timestamp: new Date().toISOString(),
    mode: actualMode,
    metrics: {
      total: queries.length,
      passed: passedCount,
      failed: queries.length - passedCount,
      accuracyAt1: passedCount / queries.length,
      mrr,
    },
    results,
  };
}

function printResults(evalResults: EvalResults): void {
  console.log(`\n${BOLD}${CYAN}━━━ SEARCH QUALITY EVALUATION ━━━${RESET}\n`);
  console.log(`${DIM}Mode: ${evalResults.mode} | Time: ${evalResults.timestamp}${RESET}\n`);

  // Print each query result
  for (const r of evalResults.results) {
    const status = r.passed ? `${GREEN}✓ PASS${RESET}` : `${RED}✗ FAIL${RESET}`;
    console.log(`${status} ${BOLD}[${r.id}]${RESET} "${r.query}"`);
    console.log(`   ${DIM}Expected: ${r.expectedPattern}${RESET}`);
    console.log(`   ${DIM}Actual #1: ${r.actualTop}${RESET}`);

    if (r.rank !== null && r.rank > 1) {
      console.log(`   ${YELLOW}Expected result at rank #${r.rank}${RESET}`);
    } else if (r.rank === null) {
      console.log(`   ${RED}Expected result NOT FOUND in top 10${RESET}`);
    }

    if (r.violations.length > 0) {
      for (const v of r.violations) {
        console.log(`   ${RED}⚠ ${v}${RESET}`);
      }
    }
    console.log();
  }

  // Print summary
  console.log(`${BOLD}━━━ SUMMARY ━━━${RESET}\n`);
  const { metrics } = evalResults;
  const accColor = metrics.accuracyAt1 >= THRESHOLDS.minAccuracyAt1 ? GREEN : RED;
  const mrrColor = metrics.mrr >= THRESHOLDS.minMRR ? GREEN : RED;

  console.log(`  Accuracy@1: ${accColor}${(metrics.accuracyAt1 * 100).toFixed(1)}%${RESET} (${metrics.passed}/${metrics.total})`);
  console.log(`  MRR:        ${mrrColor}${metrics.mrr.toFixed(3)}${RESET}`);
  console.log(`  Threshold:  Accuracy ≥ ${THRESHOLDS.minAccuracyAt1 * 100}%, MRR ≥ ${THRESHOLDS.minMRR}`);
  console.log();

  // Overall verdict
  const overallPass = metrics.accuracyAt1 >= THRESHOLDS.minAccuracyAt1 && metrics.mrr >= THRESHOLDS.minMRR;
  if (overallPass) {
    console.log(`${GREEN}${BOLD}✓ EVALUATION PASSED${RESET}\n`);
  } else {
    console.log(`${RED}${BOLD}✗ EVALUATION FAILED${RESET}\n`);
  }
}

async function saveBaseline(evalResults: EvalResults, baselinePath: string): Promise<void> {
  await fs.writeJson(baselinePath, evalResults, { spaces: 2 });
  console.log(`${GREEN}Baseline saved to: ${baselinePath}${RESET}\n`);
}

async function compareBaseline(evalResults: EvalResults, baselinePath: string): Promise<boolean> {

  if (!(await fs.pathExists(baselinePath))) {
    console.log(`${YELLOW}No baseline found at ${baselinePath}${RESET}`);
    console.log(`${DIM}Run with --record-baseline to create one${RESET}\n`);
    return true;
  }

  const baseline: EvalResults = await fs.readJson(baselinePath);

  console.log(`\n${BOLD}━━━ BASELINE COMPARISON ━━━${RESET}\n`);
  console.log(`${DIM}Baseline from: ${baseline.timestamp}${RESET}\n`);

  const accDiff = evalResults.metrics.accuracyAt1 - baseline.metrics.accuracyAt1;
  const mrrDiff = evalResults.metrics.mrr - baseline.metrics.mrr;

  const accSymbol = accDiff >= 0 ? '↑' : '↓';
  const mrrSymbol = mrrDiff >= 0 ? '↑' : '↓';
  const accColor = accDiff >= 0 ? GREEN : RED;
  const mrrColor = mrrDiff >= 0 ? GREEN : RED;

  console.log(`  Accuracy@1: ${(baseline.metrics.accuracyAt1 * 100).toFixed(1)}% → ${(evalResults.metrics.accuracyAt1 * 100).toFixed(1)}% ${accColor}(${accSymbol}${(accDiff * 100).toFixed(1)}%)${RESET}`);
  console.log(`  MRR:        ${baseline.metrics.mrr.toFixed(3)} → ${evalResults.metrics.mrr.toFixed(3)} ${mrrColor}(${mrrSymbol}${mrrDiff.toFixed(3)})${RESET}`);
  console.log();

  // Check for regressions
  const regressions: string[] = [];
  for (const current of evalResults.results) {
    const baselineResult = baseline.results.find(r => r.id === current.id);
    if (baselineResult?.passed && !current.passed) {
      regressions.push(`${current.id}: "${current.query}" - was passing, now failing`);
    }
  }

  if (regressions.length > 0) {
    console.log(`${RED}${BOLD}⚠ REGRESSIONS DETECTED:${RESET}`);
    for (const r of regressions) {
      console.log(`  ${RED}• ${r}${RESET}`);
    }
    console.log();
    return false;
  }

  console.log(`${GREEN}✓ No regressions detected${RESET}\n`);
  return true;
}

// Main
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const coreOnly = args.includes('--core');
  const recordBaseline = args.includes('--record-baseline');
  const compareBaselineFlag = args.includes('--compare-baseline');
  const fulltextOnly = args.includes('--fulltext');
  const useFixtures = args.includes('--fixtures');

  // Determine project root and baseline path based on mode
  const projectRoot = useFixtures
    ? path.join(process.cwd(), 'tests/fixtures/context')
    : process.cwd();
  const baselinePath = path.join(process.cwd(), 'tests/eval/baseline.json');

  const queries = coreOnly ? CORE_QUERIES : ALL_QUERIES;
  const mode = fulltextOnly ? 'fulltext' : 'hybrid';

  const modeLabel = useFixtures ? 'fixtures' : 'local';
  console.log(`\n${BOLD}Running ${queries.length} evaluation queries (${modeLabel} mode)...${RESET}`);
  console.log(`${DIM}Context path: ${projectRoot}${RESET}\n`);

  const results = await runEvaluation(queries, mode, projectRoot);
  printResults(results);

  if (recordBaseline) {
    await saveBaseline(results, baselinePath);
  }

  if (compareBaselineFlag) {
    const noRegressions = await compareBaseline(results, baselinePath);
    if (!noRegressions) {
      process.exit(1);
    }
  }

  // Exit with error code if thresholds not met
  if (results.metrics.accuracyAt1 < THRESHOLDS.minAccuracyAt1) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`${RED}Error: ${err.message}${RESET}`);
  process.exit(1);
});
