# nocaap setup

Interactive setup wizard to configure context packages.

## Usage

```bash
nocaap setup [options]
```

## Options

| Option | Description |
|--------|-------------|
| `-r, --registry <url>` | Registry URL to fetch contexts from |

## What It Does

1. Fetches your organization's context registry
2. Checks which repos you have access to
3. Presents an interactive selection menu
4. Clones selected packages into `.context/packages/`
5. Creates `context.config.json` and `context.lock`
6. Generates `INDEX.md`
7. Offers to build a search index (post-setup wizard)

## Examples

```bash
# Interactive setup (uses configured registry)
nocaap setup

# Setup with a specific registry
nocaap setup --registry https://github.com/your-org/context-hub
```

## Output

After setup, your project will contain:

```
.context/
├── context.config.json    # Installed packages manifest
├── context.lock           # Exact commit SHAs
├── INDEX.md               # AI-optimized index
└── packages/              # Cloned documentation
    ├── engineering/
    └── design-system/
```
