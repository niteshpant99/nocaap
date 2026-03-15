import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReadConfig,
  mockReadLockfile,
  mockResolvePushSettings,
  mockCloneToTemp,
  mockGetRemoteCommitHash,
  mockCreateBranch,
  mockCommitAll,
  mockPushBranch,
  mockGetDefaultBranch,
  mockIsDirty,
  mockCreatePr,
  mockParseRepoInfo,
  mockBuildNewPrUrl,
  mockCleanup,
  logFns,
} = vi.hoisted(() => ({
  mockReadConfig: vi.fn(),
  mockReadLockfile: vi.fn(),
  mockResolvePushSettings: vi.fn(),
  mockCloneToTemp: vi.fn(),
  mockGetRemoteCommitHash: vi.fn(),
  mockCreateBranch: vi.fn(),
  mockCommitAll: vi.fn(),
  mockPushBranch: vi.fn(),
  mockGetDefaultBranch: vi.fn(),
  mockIsDirty: vi.fn(),
  mockCreatePr: vi.fn(),
  mockParseRepoInfo: vi.fn(),
  mockBuildNewPrUrl: vi.fn(),
  mockCleanup: vi.fn().mockResolvedValue(undefined),
  logFns: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    plain: vi.fn(),
    title: vi.fn(),
    dim: vi.fn(),
    newline: vi.fn(),
    hr: vi.fn(),
  },
}));

vi.mock('../../src/core/config.js', () => ({
  readConfig: mockReadConfig,
  readLockfile: mockReadLockfile,
}));

vi.mock('../../src/core/settings.js', () => ({
  resolvePushSettings: mockResolvePushSettings,
}));

vi.mock('../../src/core/git-engine.js', () => ({
  cloneToTemp: mockCloneToTemp,
  getRemoteCommitHash: mockGetRemoteCommitHash,
  createBranch: mockCreateBranch,
  commitAll: mockCommitAll,
  pushBranch: mockPushBranch,
  getDefaultBranch: mockGetDefaultBranch,
  isDirty: mockIsDirty,
}));

vi.mock('../../src/core/github.js', () => ({
  createPr: mockCreatePr,
}));

vi.mock('../../src/utils/providers.js', () => ({
  parseRepoInfo: mockParseRepoInfo,
  buildNewPrUrl: mockBuildNewPrUrl,
}));

vi.mock('../../src/utils/logger.js', () => ({
  log: logFns,
  style: { bold: (text: string) => text, url: (text: string) => text },
  createSpinner: () => ({
    start: () => ({ succeed: vi.fn(), fail: vi.fn(), warn: vi.fn(), info: vi.fn() }),
  }),
}));

import { pushCommand } from '../../src/commands/push.js';

describe('pushCommand', () => {
  let projectRoot = '';
  let tempCloneDir = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nocaap-push-project-'));
    tempCloneDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nocaap-push-clone-'));
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(projectRoot);
    await fs.remove(tempCloneDir);
  });

  async function setupDefaultMocks(contextPath = '/identity/colors'): Promise<void> {
    const alias = 'identity-colors';
    const source = 'git@github.com:DevDashProducts/context-hub.git';
    const lockCommit = 'abc123def456';

    mockReadConfig.mockResolvedValue({
      packages: [{ alias, source, path: contextPath, version: 'main' }],
    });
    mockReadLockfile.mockResolvedValue({
      [alias]: {
        commitHash: lockCommit,
        sparsePath: contextPath,
        updatedAt: '2026-02-17T00:00:00.000Z',
      },
    });

    mockResolvePushSettings.mockResolvedValue({});
    mockGetDefaultBranch.mockResolvedValue('main');
    mockGetRemoteCommitHash.mockResolvedValue(lockCommit);
    mockCloneToTemp.mockResolvedValue({ tempDir: tempCloneDir, cleanup: mockCleanup });
    mockCreateBranch.mockResolvedValue(undefined);
    mockCommitAll.mockResolvedValue('commit123');
    mockPushBranch.mockResolvedValue(undefined);
    mockIsDirty.mockResolvedValue(true);
    mockParseRepoInfo.mockReturnValue({
      owner: 'DevDashProducts',
      repo: 'context-hub',
      provider: 'github',
    });
    mockBuildNewPrUrl.mockReturnValue('https://github.com/DevDashProducts/context-hub/pull/new');
    mockCreatePr.mockResolvedValue({
      success: true,
      url: 'https://github.com/DevDashProducts/context-hub/pull/999',
    });

    await fs.ensureDir(path.join(projectRoot, '.context', 'packages', alias));
  }

  it('copies non-flat nested packages without path doubling', async () => {
    await setupDefaultMocks('/identity/colors');

    const localPackagePath = path.join(
      projectRoot,
      '.context',
      'packages',
      'identity-colors',
      'identity',
      'colors'
    );
    await fs.ensureDir(localPackagePath);
    await fs.writeFile(path.join(localPackagePath, 'Colors.md'), '# Color Tokens\n');

    await fs.ensureDir(path.join(tempCloneDir, 'identity', 'colors'));

    await pushCommand('identity-colors', {});

    const expectedPath = path.join(tempCloneDir, 'identity', 'colors', 'Colors.md');
    const doubledPath = path.join(
      tempCloneDir,
      'identity',
      'colors',
      'identity',
      'colors',
      'Colors.md'
    );

    await expect(fs.pathExists(expectedPath)).resolves.toBe(true);
    await expect(fs.pathExists(doubledPath)).resolves.toBe(false);
    expect(mockCreatePr).toHaveBeenCalledTimes(1);
  });

  it('skips unchanged packages before branch, push, and PR', async () => {
    await setupDefaultMocks('/identity/colors');

    const localPackagePath = path.join(projectRoot, '.context', 'packages', 'identity-colors');
    await fs.writeFile(path.join(localPackagePath, 'Colors.md'), '# Same Content\n');

    await fs.ensureDir(path.join(tempCloneDir, 'identity', 'colors'));
    mockIsDirty.mockResolvedValue(false);

    await pushCommand('identity-colors', {});

    expect(mockCreateBranch).not.toHaveBeenCalled();
    expect(mockCommitAll).not.toHaveBeenCalled();
    expect(mockPushBranch).not.toHaveBeenCalled();
    expect(mockCreatePr).not.toHaveBeenCalled();
    expect(logFns.info).toHaveBeenCalledWith('identity-colors: No changes to push');
  });

  it('mirrors target subtree so deletions are represented in diff', async () => {
    await setupDefaultMocks('/identity/colors');

    const localPackagePath = path.join(projectRoot, '.context', 'packages', 'identity-colors');
    await fs.writeFile(path.join(localPackagePath, 'kept.md'), 'new content\n');

    const targetPath = path.join(tempCloneDir, 'identity', 'colors');
    await fs.ensureDir(targetPath);
    await fs.writeFile(path.join(targetPath, 'stale.md'), 'should be deleted\n');
    await fs.writeFile(path.join(targetPath, 'kept.md'), 'old content\n');

    await pushCommand('identity-colors', {});

    await expect(fs.pathExists(path.join(targetPath, 'stale.md'))).resolves.toBe(false);
    await expect(fs.readFile(path.join(targetPath, 'kept.md'), 'utf8')).resolves.toBe('new content\n');
  });

  it('fails fast on traversal-like package paths', async () => {
    await setupDefaultMocks('/identity/../../outside');

    const localPackagePath = path.join(projectRoot, '.context', 'packages', 'identity-colors');
    await fs.writeFile(path.join(localPackagePath, 'Colors.md'), '# Color Tokens\n');

    await pushCommand('identity-colors', {});

    expect(mockIsDirty).not.toHaveBeenCalled();
    expect(mockCreateBranch).not.toHaveBeenCalled();
    expect(mockPushBranch).not.toHaveBeenCalled();
    expect(mockCreatePr).not.toHaveBeenCalled();
    expect(logFns.error).toHaveBeenCalled();

    const logArgs = logFns.error.mock.calls.flat().join(' ');
    expect(logArgs).toContain('path traversal');
  });
});
