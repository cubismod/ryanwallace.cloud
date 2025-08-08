# Preview System

This repository includes an automated preview system that creates live previews of pull requests to aid in code review.

## How It Works

When a pull request is created or updated (excluding those from `cubis-renovate[bot]`), GitHub Actions automatically:

1. **Builds the site** with your changes
2. **Deploys to GitHub Pages** at a unique preview URL
3. **Comments on the PR** with the preview link
4. **Updates the preview** when you push new commits
5. **Cleans up** when the PR is closed or merged

## Preview URLs

Preview URLs follow this pattern:
```
https://{owner}.github.io/{repo}/preview/{pr-number}/
```

For example:
```
https://cubismod.github.io/ryanwallace.cloud/preview/123/
```

## Features

- **Automatic deployment** on every PR update
- **Unique URLs** for each pull request
- **Preview branding** to distinguish from production
- **Analytics disabled** in preview environments
- **Automatic cleanup** when PRs are closed
- **Concurrent builds** with proper cancellation

## Preview Environment

The preview environment includes:

- **Modified title** with "(Preview)" suffix
- **Preview branding** in the footer
- **Disabled analytics** and tracking
- **Correct base URL** for GitHub Pages deployment
- **All functionality** of the production site

## Troubleshooting

### Preview Not Deploying

1. Check that the PR is not from `cubis-renovate[bot]`
2. Verify the GitHub Actions workflow ran successfully
3. Check the Actions tab for any build errors
4. Ensure the PR targets the `main` branch

### Preview URL Not Working

1. Wait a few minutes for GitHub Pages to deploy
2. Check the Actions tab for deployment status
3. Verify the preview URL in the PR comments
4. Clear your browser cache if needed

### Build Failures

Common issues:
- **Node.js dependencies**: Ensure `yarn.lock` is up to date
- **Hugo build errors**: Check for syntax errors in content
- **Asset compilation**: Verify map assets build correctly

## Manual Preview

If you need to test locally before creating a PR:

```bash
# Build the map assets
cd ryanwallace.cloud/map
yarn install
yarn build

# Build the Hugo site
cd ..
hugo server --config hugo.preview.toml
```

## Configuration

The preview system uses:
- `hugo.preview.toml` - Preview-specific Hugo configuration
- `.github/workflows/preview.yml` - Preview deployment workflow
- `.github/workflows/cleanup-preview.yml` - Cleanup workflow

## Security

- Previews are publicly accessible but not indexed by search engines
- No sensitive data is exposed in preview environments
- Analytics and tracking are disabled in previews
- Previews are automatically cleaned up when PRs are closed
