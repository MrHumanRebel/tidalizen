# Tidalizen

Tidalizen = native Samsung Tizen TV WGT app shell for TIDAL listening flow. Built for TV remote, AVPlay, diagnostics, signed packaging.

## Reality check
- No private TIDAL credentials in repo.
- No DRM bypass.
- Full playback needs valid TIDAL account/client permissions.
- Physical TV install needs valid Samsung/Tizen certificate for target TV.

## Features
- Home/Search/Library/Now Playing/Settings/Diagnostics screens.
- Samsung remote keys: arrows, OK, back, media keys, color keys.
- AVPlay adapter + guarded browser fallback mode.
- Boot/runtime fatal overlay to avoid white-screen dead end.
- Redacted logs + diagnostics payload.

## Local checks
```bash
npm run verify
npm run package:debug
npm run verify:wgt
```

## CI signing secrets
Configure GitHub secrets:
- `TIZEN_CERT_P12_BASE64`
- `TIZEN_CERT_PASSWORD`
- `TIZEN_PROFILE_NAME` (optional, default `Tidalizen`)

Behavior:
- real cert present -> production signed WGT path.
- real cert missing -> debug mode only; tag release blocked.

## Build + install
- Build/release pipeline: `.github/workflows/build-wgt.yml`
- TV install guide: `docs/INSTALL_TV.md`
- Windows helper: `scripts/install-tv.ps1`

## Known limitations
- Device-code login works only for TIDAL clients allowed for limited-input auth.
- Manifest/DRM support depends on TIDAL entitlement + TV runtime capability.
