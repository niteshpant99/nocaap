# nocaap push

Push local changes to upstream repository as a pull request.

## Usage

```bash
nocaap push [alias] [options]
```

## Options

| Option | Description |
|--------|-------------|
| `-m, --message <message>` | Commit message for the PR |
| `-a, --all` | Push all packages with changes |

## Examples

```bash
# Push a specific package
nocaap push engineering -m "Update API docs"

# Push all changed packages
nocaap push --all

# Interactive selection (no alias)
nocaap push
```

## How It Works

1. Detects which packages have local changes
2. For each selected package:
    - Clones the upstream repo to a temp directory
    - Creates branch `nocaap/<alias>-YYYYMMDD`
    - Copies local changes into the clone
    - Checks for actual diffs (skips if no changes)
    - Commits, pushes, and creates a PR
3. Prints PR URLs for all created PRs

## PR Creation Methods

nocaap tries these in order:

1. **GitHub CLI** (`gh`) — if authenticated
2. **GitHub API** — if `GITHUB_TOKEN` is set
3. **Manual URL** — prints a link to create the PR manually

## Best Practice

Always update before pushing to avoid divergence errors:

```bash
nocaap update <alias>
nocaap push <alias> -m "Your message"
```
