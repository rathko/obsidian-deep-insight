
# Local Development

1. Clone the repo into your Obsidian plugins folder
2. Build the plugin using:
   ```bash
   # Ensure you have Node v20.18.0, either using nvm or installing Node directly 
   nvm install
   nvm use
   # Build the plugin
   npm install
   npm run build
   ```
3. Reopen Obsidian, "Deep Insight" should be accessible in settings (make sure "Community Plugins" are enabled and enable Deep Insight in the installed plugins)
4. Configure "Deep Insight" with your Anthropic or OpenAI API key

# Deep Insight Plugin - Release Guide

## Steps to Release a New Version

### 1. Update Version in `manifest.json` and `package.json`

### 2. Commit Changes

### 3. Create a New Git Tag

Create an annotated tag that matches the new version number you set in `manifest.json` and `package.json`.

```bash
git tag -a 1.0.3 -m "Release version 1.0.3"
git push origin 1.0.3
```

### 4. Monitor the GitHub Action Workflow

Note: using Github Obsidian plugin release action https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions

### 5. Publish the Release

Once the GitHub Action workflow completes:

1. Go to repository's **Releases** section.
2. Click **Edit** for the new draft.
3. Add release notes describing the new features, bugfixes, or changes in this version.
4. Click **Publish release** to make it available to users.

## Notes

- The `main.js`, `manifest.json`, and `styles.css` files will be bundled and attached to the GitHub release automatically.

Plugin's users will now be able to update to the new version!
