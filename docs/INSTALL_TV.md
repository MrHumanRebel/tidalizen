# Install Tidalizen on Samsung TV (UE65MU6100 class)

## 1) Enable Developer Mode on TV
1. Open Apps panel.
2. Enter `12345` to open Developer Mode panel (model dependent).
3. Enable Developer Mode.
4. Set host PC IP.
5. Reboot TV.

## 2) Connect
```powershell
sdb connect TV_IP
sdb devices
```

## 3) Permit + install
If WGT signed with Samsung certificate for this TV:
```powershell
tizen install-permit -t UE65MU6100
tizen install -n app/release/Tidalizen.wgt -t UE65MU6100
```

## Read TV logs
```powershell
sdb dlog | findstr /i "Tidalizen AVPlay DRM"
```

## Why install failed[118]
- unsigned/manual WGT used as production artifact.
- certificate missing/invalid for target TV.
- TV not permitted (`install-permit` missing).
- wrong distributor certificate chain.
- unsupported privilege for cert/runtime policy.
- malformed `config.xml` (profile/content/icon/app id/package id).
- app id/package conflict from stale old install.
- target TV Tizen generation mismatch.
- WGT signed by cert not accepted by this TV.

## Privilege notes
- `http://developer.samsung.com/privilege/avplay` = required for AVPlay playback.
- `http://developer.samsung.com/privilege/productinfo` = diagnostics only; can be removed if model/policy rejects it.
- `http://tizen.org/privilege/internet` + `network.get` required for API/media network calls.
- `http://tizen.org/privilege/application.launch` optional convenience.
