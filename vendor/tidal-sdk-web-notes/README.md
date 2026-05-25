# TIDAL SDK Web notes

The uploaded `tidal-sdk-web-main.zip` was used as API/auth reference material.

Important SDK notes reflected in Tidalizen:

- `@tidal-music/auth` supports Authorization Code, Client Credentials, Device Login, and setting existing credentials.
- Device Login is documented as available only for TIDAL internally developed applications for now.
- The player SDK is browser/EME-oriented; on Samsung TV Tidalizen routes playback through `webapis.avplay` instead.
- `trackManifests` with `uriScheme=HTTPS` is preferred for a native TV player because AVPlay expects URL-based sources.
