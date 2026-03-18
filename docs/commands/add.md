# nocaap add

Add a context package from a Git repository.

## Usage

```bash
nocaap add <repo> [options]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --path <path>` | Sparse checkout path within the repo | (root) |
| `-a, --alias <name>` | Local alias for the package | (auto-generated) |
| `-b, --branch <branch>` | Branch or tag to checkout | `main` |

## Examples

```bash
# Add an entire repo
nocaap add git@github.com:your-org/api-docs.git

# Add a specific folder from a monorepo
nocaap add git@github.com:your-org/monorepo.git --path docs/security --alias security-docs

# Add from a specific branch
nocaap add git@github.com:your-org/docs.git --branch develop
```

## How It Works

1. Validates the repository URL
2. Checks access via `git ls-remote`
3. Performs a partial clone with sparse checkout (if `--path` specified)
4. Adds the package to `context.config.json` and `context.lock`
5. Regenerates `INDEX.md`
