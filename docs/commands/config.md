# nocaap config

Manage nocaap configuration. Supports global and project-level settings.

## Usage

```bash
nocaap config [key] [value] [options]
```

## Options

| Option | Description |
|--------|-------------|
| `-l, --list` | Show all configuration |
| `-g, --global` | Use global config scope (`~/.nocaap/config.json`) |
| `-p, --project` | Use project config scope (`.context/settings.json`) |

## Examples

```bash
# Set default registry (global)
nocaap config registry https://github.com/your-org/context-hub

# View all config
nocaap config --list

# Set project-level search weights
nocaap config --project search.fulltextWeight 0.3
```

## Config Scopes

| Scope | Location | Purpose |
|-------|----------|---------|
| Global | `~/.nocaap/config.json` | User-wide defaults |
| Project | `.context/settings.json` | Project-specific overrides |

**Priority:** CLI flags > Project config > Global config > Defaults
