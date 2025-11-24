/**
* src/utils/logger.ts 
* Logger utilities with Chalk + Ora wrappers
 */
import chalk from 'chalk';
import ora, { type Ora } from 'ora';

// =============================================================================
// Chalk Wrappers
// =============================================================================

export const log = {
  /** Info message (blue) */
  info: (message: string) => console.log(chalk.blue('ℹ'), message),

  /** Success message (green) */
  success: (message: string) => console.log(chalk.green('✔'), message),

  /** Warning message (yellow) */
  warn: (message: string) => console.log(chalk.yellow('⚠'), message),

  /** Error message (red) */
  error: (message: string) => console.log(chalk.red('✖'), message),

  /** Debug message (gray) - only when NOCAAP_DEBUG=true */
  debug: (message: string) => {
    if (process.env.NOCAAP_DEBUG === 'true') {
      console.log(chalk.gray('🔍'), chalk.gray(message));
    }
  },

  /** Plain message */
  plain: (message: string) => console.log(message),

  /** Styled title */
  title: (message: string) => console.log(chalk.bold.cyan(`\n${message}\n`)),

  /** Dim helper text */
  dim: (message: string) => console.log(chalk.dim(message)),

  /** Empty line for spacing */
  newline: () => console.log(),

  /** Horizontal rule */
  hr: () => console.log(chalk.dim('─'.repeat(50))),
};

// =============================================================================
// Styled Text Helpers
// =============================================================================

export const style = {
  bold: (text: string) => chalk.bold(text),
  dim: (text: string) => chalk.dim(text),
  italic: (text: string) => chalk.italic(text),
  underline: (text: string) => chalk.underline(text),
  code: (text: string) => chalk.cyan(`\`${text}\``),
  path: (text: string) => chalk.yellow(text),
  url: (text: string) => chalk.blue.underline(text),
  success: (text: string) => chalk.green(text),
  error: (text: string) => chalk.red(text),
  warn: (text: string) => chalk.yellow(text),
};

// =============================================================================
// Ora Spinner Wrappers
// =============================================================================

export interface SpinnerInstance {
  start: (text?: string) => SpinnerInstance;
  stop: () => SpinnerInstance;
  succeed: (text?: string) => SpinnerInstance;
  fail: (text?: string) => SpinnerInstance;
  warn: (text?: string) => SpinnerInstance;
  info: (text?: string) => SpinnerInstance;
  text: string;
}

/**
 * Create a spinner instance
 */
export function createSpinner(text?: string): SpinnerInstance {
  const spinner = ora({
    text,
    color: 'cyan',
  });

  const instance: SpinnerInstance = {
    start(newText?: string) {
      spinner.start(newText);
      return instance;
    },
    stop() {
      spinner.stop();
      return instance;
    },
    succeed(newText?: string) {
      spinner.succeed(newText);
      return instance;
    },
    fail(newText?: string) {
      spinner.fail(newText);
      return instance;
    },
    warn(newText?: string) {
      spinner.warn(newText);
      return instance;
    },
    info(newText?: string) {
      spinner.info(newText);
      return instance;
    },
    get text() {
      return spinner.text;
    },
    set text(value: string) {
      spinner.text = value;
    },
  };

  return instance;
}

/**
 * Run an async task with a spinner
 */
export async function withSpinner<T>(
  text: string,
  task: () => Promise<T>,
  options?: {
    successText?: string;
    failText?: string;
  }
): Promise<T> {
  const spinner = ora(text).start();

  try {
    const result = await task();
    spinner.succeed(options?.successText || text);
    return result;
  } catch (error) {
    spinner.fail(options?.failText || text);
    throw error;
  }
}

