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
*   **AI Optimized:** auto-generates a token-conscious `INDEX.md` that guides AI agents to the right files without blowing up context windows.

## 📦 Installation

```bash
npm install -g nocaap
# OR run directly
npx nocaap setup
```

## 🛠️ Usage

### 1. The Setup Wizard (Recommended)
The easiest way to get started. Connects to your organization's registry map and lets you interactively select contexts.

```bash
npx nocaap setup
```
*   Prompts for Registry URL (e.g., `https://raw.githubusercontent.com/acme/hub/main/nocaap-registry.json`).
*   Checks access permissions.
*   Installs selected contexts.

### 2. Manual Add
Add a specific repository or folder directly.

```bash
# Add a full repo
npx nocaap add git@github.com:acme/engineering-standards.git

# Add a specific folder (Sparse Checkout)
npx nocaap add git@github.com:acme/monorepo.git --path /docs/security
```

### 3. Update & Sync
Checks for updates, verifies file integrity, and regenerates the index.

```bash
npx nocaap update
```
*   **Safety:** Checks for local changes ("Dirty State") before overwriting.
*   **Drift:** Detects if the remote version or configured path has changed.

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

## 🤝 Contributing

This is an open-source PoC. We welcome contributions!
1.  Clone the repo.
2.  `npm install`
3.  `npm run dev`
