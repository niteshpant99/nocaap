# Getting Started

## Who This Is For

Anyone using nocaap for the first time — contributors updating context docs and maintainers validating the end-to-end flow.

## What You Will Finish With

By the end of this guide, you will have:

- Installed nocaap
- Installed context into `.context/`
- Pushed a change as a pull request
- Merged it in GitHub

## 1. Install and Verify

```bash
npm install -g nocaap
nocaap --help
```

You should see command help output.

## 2. Set Your Registry

```bash
nocaap config registry https://github.com/your-org/context-hub
```

If your registry JSON is at a different path, use that URL instead.

## 3. Run Setup

```bash
nocaap setup
```

What to expect:

- Interactive context selection
- Access checks for selected repos
- `.context/` created in your project

Quick verify:

```bash
ls .context
```

You should see `context.config.json`, `context.lock`, `INDEX.md`, and `packages/`.

## 4. Make a Small Local Change

Edit a file under `.context/packages/<alias>/...` (for example, fix a typo).

Before pushing, sync first:

```bash
nocaap update <alias>
```

This prevents upstream divergence errors.

## 5. Push and Create a PR

```bash
nocaap push <alias> -m "Fix typo in onboarding docs"
```

What nocaap does:

- Creates branch `nocaap/<alias>-YYYYMMDD`
- Commits and pushes the change
- Creates a PR automatically when possible
- Prints a PR URL

## 6. Merge the PR in GitHub

Open the PR URL and:

1. Review changed files
2. Confirm checks are green
3. Click **Squash and merge**
4. Optionally delete the branch

## 7. Confirm Final State

```bash
nocaap update <alias>
```

You should now be in sync with upstream and have no pending local changes for that package.

## Alternative: GitHub CLI Merge

If you prefer CLI merge:

```bash
gh pr merge <number> --squash --delete-branch
```

## Windows Note

Commands are the same on Windows in most cases. Only OS-specific file paths differ.
