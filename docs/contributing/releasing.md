# Releasing

How to cut a new release of nocaap. Releases are manual and controlled by project maintainers.

## When to Release

- A coherent set of changes is complete (bug fixes, feature, infrastructure)
- A security fix is ready — release immediately
- A breaking change lands — bump minor version (pre-1.0 convention)

## Pre-release Checklist

```bash
git checkout main
git pull origin main
npm run check          # typecheck + lint
npm run test:unit      # unit tests
npm run build          # production build
```

- [ ] All changes merged to `main`
- [ ] `npm run check` passes
- [ ] `npm run test:unit` passes
- [ ] `npm run build` succeeds
- [ ] `CHANGELOG.md` has an up-to-date `[Unreleased]` section

## Release Steps

### 1. Update CHANGELOG.md

Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and add a new empty `## [Unreleased]` section above it.

### 2. Bump version

```bash
npm version patch --no-git-tag-version
```

### 3. Commit and tag

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
```

### 4. Push

```bash
git push origin main --follow-tags
```

### 5. Publish to npm

```bash
npm publish
```

### 6. Create GitHub Release

Go to the [releases page](https://github.com/niteshpant99/nocaap/releases/new), select the tag, paste the changelog section, and publish.

## Post-release Verification

```bash
npm info nocaap version
npx nocaap@X.Y.Z --help
```

## Versioning

nocaap follows [Semantic Versioning](https://semver.org/).

**Pre-1.0** (current): `0.0.x` for patches, `0.x.0` for breaking changes.
