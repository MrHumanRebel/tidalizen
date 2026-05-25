# Tidalizen architecture

Tidalizen is a Tizen Web Application WGT. It is intentionally static and TV-native.

## Runtime layers

- `platform.js`: Tizen/Samsung capability detection, remote-key registration, shared diagnostics, safe localStorage helpers.
- `tidal-api.js`: TIDAL OAuth/API adapter. It implements device login, token refresh, session, favorites, search, and track-manifest retrieval using SDK-aligned endpoint shapes.
- `player.js`: Samsung AVPlay adapter with DRM event forwarding and HTML audio fallback for development.
- `app.js`: TV UI, spatial focus, queue, settings, diagnostics, and player controls.

## Why no local TizenBrew service

The uploaded TidalBrew build uses a local Node service on `127.0.0.1`. Native WGT apps cannot rely on that service existing, so Tidalizen moves the app shell and playback control into the WGT. Where server-side proxy behavior used to help with CORS or manifest serving, this app first tries HTTPS manifest URLs from TIDAL and uses a Blob URL fallback for DATA manifests.

On older Samsung TVs, `blob:` manifests may not be accepted by AVPlay. A device-valid TIDAL integration should prefer `uriScheme=HTTPS` from `trackManifests`.

## Build pipeline

The GitHub Actions workflow follows the proven Tizen/Jellyfin pattern:

1. Install Tizen Studio Web CLI.
2. Import or generate a certificate.
3. Add a signing profile.
4. Patch `.pwd` references in `profiles.xml` to avoid headless CI signer read failures.
5. Run `tizen build-web`.
6. Run `tizen package` through `expect`.
7. If official signing fails, create a structural unsigned WGT fallback.

The fallback is deliberately last. A signed WGT is always preferred.
