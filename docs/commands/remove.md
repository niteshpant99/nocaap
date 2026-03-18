# nocaap remove

Remove a context package.

## Usage

```bash
nocaap remove <alias> [options]
nocaap rm <alias> [options]
```

## Options

| Option | Description |
|--------|-------------|
| `--force` | Force removal even if the package has uncommitted changes |

## Examples

```bash
# Remove a package
nocaap remove security-docs

# Force remove even if dirty
nocaap rm engineering --force
```

## How It Works

1. Checks for uncommitted changes in the package
2. If dirty and `--force` not set, aborts with a warning
3. Removes the package from `.context/packages/`
4. Removes the entry from `context.config.json` and `context.lock`
5. Regenerates `INDEX.md`
