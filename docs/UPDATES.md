# Updates And Releases

Axon uses GitHub Releases as the public update source. The app can check for a
new release, show update state, and guide the user to the correct artifact.

## Why Updates Are Not Always Fully Automatic

Axon is currently a personal-use app and macOS builds are not signed or
notarized with an Apple Developer certificate.

That matters because macOS protects app replacement and relaunch flows with
Gatekeeper. Electron's smooth update path works best when the app is signed,
notarized, and distributed consistently. Without that certificate chain, macOS
can allow a manually opened app while still blocking or interrupting automatic
replacement/relaunch behavior.

So Axon treats in-app updating as best-effort:

- The app can detect that a release exists.
- The app can show update state and release notes.
- The app can point to the right GitHub release.
- Manual download/replacement remains the reliable path for unsigned macOS
  builds.

This is not a Windows/Linux signing limitation in the same way, but each
platform package still needs testing before a release is treated as stable.

## Release Workflow

1. Bump `editor/package.json`.
2. Update `CHANGELOG.md`.
3. Commit the release changes.
4. Tag with `v<version>`.
5. Push the tag.
6. Let GitHub Actions build platform artifacts.
7. Check artifacts before publishing the release.

```bash
git tag v1.0.7
git push origin v1.0.7
```

## Artifact Guide

- `Axon-<version>-arm64.dmg`: macOS Apple Silicon
- `Axon-<version>.dmg`: macOS Intel
- `Axon.Setup.<version>.exe`: Windows
- `Axon-<version>.AppImage`: Linux AppImage
- `axon_<version>_amd64.deb`: Debian/Ubuntu

## Future Improvement

Fully smooth macOS updates require a signed and notarized build. That means an
Apple Developer Program certificate, hardened runtime setup, notarization, and
consistent release packaging.
