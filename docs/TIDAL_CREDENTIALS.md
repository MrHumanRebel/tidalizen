# TIDAL credentials and login modes

Tidalizen does not include TIDAL production credentials.

## Supported modes

### Device login

The app can call the OAuth device authorization endpoint and display a phone-friendly code. This requires a `clientId` that TIDAL allows to use limited-input device login. The official SDK documentation notes that this flow is currently available only for internally developed TIDAL applications.

### Manual access token import

For development, paste either:

```json
{"access_token":"...","refresh_token":"..."}
```

or a raw bearer access token string into Settings.

### Refresh token

If a refresh token is present and your client configuration permits refresh, Tidalizen will refresh after a 401.

## Security note

Any credential typed into a TV app is stored in that TV app's localStorage. Do not put high-value production secrets into a shared TV.
