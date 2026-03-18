# FAQ

## Do I need GitHub CLI (`gh`) to use nocaap?

No. nocaap can still push branches and provide a manual PR URL. `gh` only improves automation for PR creation and CLI merge workflows.

## Do I need a `GITHUB_TOKEN`?

Not required for basic usage. It is only used as a fallback to auto-create PRs when `gh` is unavailable.

## What is the default merge method?

GitHub web UI with **Squash and merge** is the recommended default.

## Does `nocaap push` merge PRs automatically?

No. It creates/pushes a branch and opens or links to a PR. A human review and merge step is still required.

## What should I commit in my repo?

**Commit:**

- `.context/context.config.json`
- `.context/context.lock`
- `.context/INDEX.md` (if your team expects it in version control)

**Do not commit:**

- `.context/packages/` contents (should be gitignored)
- Search index artifacts unless your team explicitly wants them versioned

## Can I use private repositories?

Yes. nocaap uses your existing Git credentials (typically SSH). If you can access the repo with Git, nocaap can use it.

## Should I run update before push?

Yes. Best practice:

```bash
nocaap update <alias>
nocaap push <alias> -m "Your message"
```

This avoids upstream divergence errors.

## Can I push all changed packages at once?

Yes:

```bash
nocaap push --all
```

## Are macOS and Linux commands different?

For nocaap, they are usually the same. Windows may differ in shell syntax and local config paths.
