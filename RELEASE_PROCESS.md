# MonadForge Release Process

This document outlines the standard release process for MonadForge updates.

---

## 1. Quality Control
Before triggering a new release, you must check that the code builds and all tests pass with >95% branch coverage:

```bash
# Check compiler output
npm run build

# Verify branch coverage is >95%
npm test
```

---

## 2. Versioning
We use [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Update the version fields in:
- Root `package.json`
- Wrapper `monadforge/package.json`
- Other package workspaces `package.json`

---

## 3. Creating a Release Tag
Tag the repository to trigger the GitHub Actions publication pipeline:

```bash
git checkout main
git pull origin main

# Standard semver version tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

---

## 4. Verification
Once the GitHub Action completes successfully, verify the package is available on npm:

```bash
npm info @monadforge/automated
```
