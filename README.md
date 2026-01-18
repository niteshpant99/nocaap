# nocaap 🧢

**Normalized Organizational Context-as-a-Package**

> "No scattered docs. No inconsistent AI. No cap."

**nocaap** is a developer-first tool that standardizes how AI agents (Cursor, Copilot, Claude) discover and consume organizational knowledge. It uses a **Hub-and-Spoke** Git architecture to fetch documentation from various repositories into a unified, AI-optimized local index.

## 🚀 Why?

Your AI coding assistant is only as good as its context.
*   **The Problem:** Your Security SOPs are in one repo, Design Tokens in another, and API specs in a third. Your AI is guessing.
*   **The Solution:** `nocaap` creates a standardized `.context/` folder in your project, populated with the exact versions of the documents your team needs.

## ✨ Key Features

*   **Hub-and-Spoke Discovery:** One "Registry" file maps your entire organization's knowledge. Users just select "Engineering" or "Finance" from a menu.
*   **Native Git Security:** We don't handle tokens. If you have SSH access to the repo via GitHub/GitLab, it works. If you don't, it skips. Zero configuration.
*   **Lightning Fast:** Uses `git sparse-checkout` and `partial clones` to fetch *only* the specific documentation folders you need, not the entire repo history.
*   **AI Optimized:** Auto-generates a token-conscious `INDEX.md` that guides AI agents to the right files without blowing up context windows.
*   **Private Repo Support:** Seamlessly handles private repositories using your existing SSH keys - no tokens to manage.

## 📦 Installation

```bash
# Install from npm (recommended)
npm install -g nocaap
```

### Alternative: Install from Source

```bash
# Clone the repo
git clone https://github.com/niteshpant99/nocaap.git
cd nocaap

# Install dependencies and build
pnpm install
pnpm run build

# Link globally
npm link
```

## 🏗️ Setting Up Your Organization's Context Hub

Want to create your own context registry? Use the **official starter template**:

👉 **[nocaap-context-template](https://github.com/niteshpant99/nocaap-context-template)**

This template includes:
- 📁 Pre-configured folder structure for organizing contexts
- 🔄 Scripts to auto-generate `nocaap-registry.json` from your markdown files
- ⚡ GitHub Actions for automatic registry updates on push
- 📝 Example contexts to get you started

**Quick Start:**
1. [Fork the template](https://github.com/niteshpant99/nocaap-context-template/fork)
2. Add your organization's documentation
3. Push - the registry auto-updates!

Your team can then point nocaap to your new registry and start using it immediately.

---

## 🔧 Configuration

### Setting Your Organization's Registry

nocaap accepts any URL format - just paste what you copy from your browser:

```bash
# GitHub repo URL (easiest - we figure out the rest)
nocaap config registry https://github.com/your-org/context-hub

# GitHub file URL (if registry is at a specific path)
nocaap config registry https://github.com/your-org/context-hub/blob/main/nocaap-registry.json

# Raw URL (for public repos)
nocaap config registry https://raw.githubusercontent.com/your-org/context-hub/main/nocaap-registry.json

# SSH URL (explicit, for power users)
nocaap config registry git@github.com:your-org/context-hub.git
```

**How it works:**
1. nocaap detects the URL format automatically
2. Tries HTTP first (fast, works for public repos)
3. Falls back to SSH if needed (works for private repos using your SSH keys)

**Private repos work seamlessly** - just have your SSH keys configured!

```bash
# View current config
nocaap config --list

# Clear saved registry
nocaap config registry --clear
```

## 🛠️ Usage

### 1. The Setup Wizard (Recommended)
The easiest way to get started. Connects to your organization's registry map and lets you interactively select contexts.

```bash
nocaap setup
```
*   Uses your saved registry, or prompts for one
*   Checks access permissions (HTTP and SSH)
*   Shows available contexts with descriptions
*   Installs selected contexts

### 2. Manual Add
Add a specific repository or folder directly.

```bash
# Add a full repo
nocaap add git@github.com:your-org/engineering-standards.git

# Add a specific folder (Sparse Checkout)
nocaap add git@github.com:your-org/monorepo.git --path docs/security --alias security-docs
```

### 3. Update & Sync
Checks for updates, verifies file integrity, and regenerates the index.

```bash
nocaap update
```
*   **Safety:** Checks for local changes ("Dirty State") before overwriting.
*   **Drift:** Detects if the remote version or configured path has changed.

### 4. Push Changes Upstream

Push local context changes back to the source repository as a PR.

```bash
# Interactive - select packages to push
nocaap push

# Push specific package
nocaap push engineering

# Push all changed packages
nocaap push --all

# With custom commit message
nocaap push engineering -m "Update API documentation"
```

**Features:**
- Creates branch: `nocaap/{alias}-{YYYYMMDD}`
- Auto-creates PR via gh CLI or GitHub API
- Detects upstream divergence (requires `nocaap update` first)

### 5. Other Commands

```bash
# List installed packages
nocaap list

# Remove a package
nocaap remove <alias>

# Regenerate INDEX.md
nocaap generate
```

## 📋 Command Reference

| Command | Description |
|---------|-------------|
| `nocaap setup` | Interactive setup wizard |
| `nocaap add <repo>` | Add a context package |
| `nocaap update [alias]` | Update packages (or all if no alias) |
| `nocaap list` | List installed packages |
| `nocaap remove <alias>` | Remove a package |
| `nocaap push [alias]` | Push changes upstream as PR |
| `nocaap generate` | Regenerate INDEX.md |
| `nocaap config [key] [value]` | Manage configuration |

## 📂 Directory Structure

`nocaap` manages everything inside `.context/`. You should commit `context.config.json` and `context.lock`, but **ignore** the packages.

```text
project-root/
├── .gitignore            # Should include .context/packages/
├── .context/
│   ├── context.config.json   # Manifest of installed contexts
│   ├── context.lock          # Exact commit SHAs for reproducibility
│   ├── INDEX.md              # THE file you point your AI to
│   └── packages/             # Cloned content (Partial clones)
│       ├── engineering/
│       └── design-system/
```

## 🤖 AI Integration

To make your AI aware of the context, simply mention `@.context/INDEX.md` in your prompt, or configure your editor:

**VS Code / Cursor (`.vscode/settings.json`):**
```json
{
  "github.copilot.chat.context.additionalContextFiles": [
    ".context/INDEX.md"
  ]
}
```

## 🔐 Private Repository Support

nocaap uses your existing Git credentials for private repos:

| Repository Type | How It Works |
|----------------|--------------|
| **Public** | Direct HTTP fetch (fast) |
| **Private** | SSH clone (uses your `~/.ssh` keys) |

**Setup for private repos:**
1. Ensure SSH keys are configured: `ssh -T git@github.com`
2. Use any URL format - nocaap auto-detects and falls back to SSH if needed

No tokens to manage, no credentials to store - true "Zero Auth" design.

## 🤝 Contributing

This is an open-source PoC. We welcome contributions!
1.  Clone the repo.
2.  `pnpm install`
3.  `pnpm run dev`

## 📄 License

MIT
