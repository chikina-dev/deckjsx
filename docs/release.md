# Release Process

This package is designed to publish from GitHub Actions using npm Trusted Publishing.

## One-time npm setup

In the npm package settings for `deckjsx`, add a trusted publisher:

- Provider: GitHub Actions
- Organization or user: `chikina-dev`
- Repository: `deckjsx`
- Workflow filename: `release.yml`

Trusted Publishing uses GitHub Actions OIDC, so no `NPM_TOKEN` secret is needed.

## Manual release

1. Update `package.json` to the target version.
2. Push the change to `main`.
3. Run the `Release` workflow from GitHub Actions with a matching tag such as `v0.1.1`.

The workflow validates the package version, runs checks and tests, creates the GitHub release, and
publishes the package to npm.

## Publishing from an existing GitHub release

Publishing a GitHub release also runs the same workflow. The release tag must match the package
version in `package.json`.
