# nocaap update

Update context packages to latest upstream versions and regenerate the index.

## Usage

```bash
nocaap update [alias] [options]
```

## Options

| Option | Description |
|--------|-------------|
| `--force` | Force update even if packages appear clean |

## Examples

```bash
# Update all packages
nocaap update

# Update a specific package
nocaap update engineering

# Force update even if no changes detected
nocaap update --force
```

## How It Works

1. Reads `context.config.json` and `context.lock`
2. For each package, compares remote commit hash with lockfile
3. If different and no local dirty state, re-clones the package
4. Updates `context.lock` with new commit hashes
5. Regenerates `INDEX.md`

Packages with uncommitted local changes are skipped with a warning. Use `nocaap push` first to submit your changes, then update.
