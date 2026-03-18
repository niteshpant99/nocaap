# GitHub Workflow

How to contribute context updates using nocaap and GitHub.

## Default Policy

- PR creation: `nocaap push`
- PR review and merge: GitHub web UI
- Merge method: **Squash and merge**

CLI alternatives are included, but web UI is the default path.

## 1. Pre-PR Checklist

Before pushing:

```bash
nocaap update <alias>
```

Then confirm:

- Your change is in `.context/packages/<alias>/...`
- Your commit message intent is clear

## 2. Create the PR

```bash
nocaap push <alias> -m "Update API authentication notes"
```

nocaap will:

- Create branch `nocaap/<alias>-YYYYMMDD`
- Push it to the source repository
- Attempt PR creation via `gh` CLI, GitHub API, or manual URL fallback

## 3. Review and Merge (Web UI)

1. Open the PR URL
2. Review file diffs
3. Wait for required checks
4. Click **Squash and merge**
5. Delete the branch after merge

## 4. Optional CLI Merge

```bash
gh pr view <number>
gh pr checks <number>
gh pr merge <number> --squash --delete-branch
```

## 5. Post-Merge Sync

```bash
nocaap update <alias>
```

## Common Failure Modes

| Error | Fix |
|-------|-----|
| "Upstream has changed" | Run `nocaap update <alias>` and retry push |
| "PR not created automatically" | Open the manual URL printed by nocaap |
| "No changes to commit" | Your local package matches upstream |
