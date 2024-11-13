# Deep Insight AI Plugin - Release Guide

## Steps to Release a New Version

### 1. Update Version in `manifest.json` and `package.json`

### 2. Commit Changes

### 3. Create a New Git Tag

Create an annotated tag that matches the new version number you set in `manifest.json` and `package.json`.

```bash
git tag -a 1.0.2 -m "Release version 1.0.2"
git push origin 1.0.2
```

### 4. Monitor the GitHub Action Workflow

### 5. Publish the Release

Once the GitHub Action workflow completes:

1. Go to repository's **Releases** section.
2. Click **Edit** for the new draft.
3. Add release notes describing the new features, bugfixes, or changes in this version.
4. Click **Publish release** to make it available to users.

## Notes

- The `main.js`, `manifest.json`, and `styles.css` files will be bundled and attached to the GitHub release automatically.

Plugin's users will now be able to update to the new version!
