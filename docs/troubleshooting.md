# Troubleshooting

Common issues during setup, update, push, and PR flow.

## Quick Triage

Run these first:

```bash
nocaap --help
nocaap list
```

If both fail, fix installation before debugging workflow issues.

## "nocaap: command not found"

- **Cause:** Global install missing or not on `PATH`.
- **Fix:**

```bash
npm install -g nocaap
nocaap --help
```

If still missing, restart terminal and retry.

## "Upstream has changed. Run 'nocaap update' first."

- **Cause:** Remote moved ahead of your local lock state.
- **Fix:**

```bash
nocaap update <alias>
nocaap push <alias> -m "Your message"
```

## "No changes to commit"

- **Cause:** No effective diff between local package and upstream.
- **Fix:** Confirm your edit was saved in `.context/packages/<alias>/...`, then retry.

## PR was not auto-created

- **Cause:** No authenticated PR automation method available.
- **Fix options:**
    - Open the manual PR URL printed by nocaap
    - Or set up automation: `gh auth login` or set `GITHUB_TOKEN`

## Repository access denied / auth failed

- **Cause:** SSH key or GitHub permissions not configured.
- **Fix:**

```bash
ssh -T git@github.com
```

Then verify you have read/write access to the target repository.

## Wrong package or path content appears in PR

- **Cause:** Wrong alias/path target or stale local package state.
- **Fix:**

1. Check package path in `.context/context.config.json`
2. Run `nocaap update <alias>`
3. Re-apply your intended change and push again

## Setup completed but `.context/` is missing expected files

- **Cause:** Partial setup or interrupted command.
- **Fix:**

1. Re-run `nocaap setup`
2. Run `nocaap index` to rebuild search index and `INDEX.md`
3. Validate `.context/context.config.json` and `.context/context.lock` exist

## Windows Note

Core commands are the same on Windows. Most differences are shell syntax and local file paths.
