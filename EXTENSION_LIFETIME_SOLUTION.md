# Extension Lifetime Solution

This repository already supports a compliant "unlimited" mode for paid lifetime installs without bypassing the credit system.

## What is implemented

- Lifetime entitlement is resolved server-side from completed purchases and install metadata.
- The credits API returns `unlimited: true` for entitled installs.
- The extension keeps a client-side batch cap of 100 displayed results for unlimited installs.
- The packaging script builds the browser ZIP and copies it into the gated download asset folder.

## Source of truth

- `map-scraper-paddle-backend/lib/helpers.js` marks lifetime prices with `unlimited: true` and persists install entitlement.
- `map-scraper-paddle-backend/api/credits.js` returns unlimited access for entitled installs and skips deductions.
- `Web/maps-scraper-extension-v1.0/background.js` uses `UNLIMITED_BATCH_RESULTS = 100` for the client-side unlimited display cap.
- `Web/build-extension.js` outputs `Web/dist/maps-scraper-extension-v1.0.zip` and copies it to `Web/api/_assets/maps-scraper-extension-v1.0.zip`.

## Build command

Run from `Web/`:

```powershell
node .\build-extension.js
```

## Built artifact

- `Web/dist/maps-scraper-extension-v1.0.zip`
- `Web/api/_assets/maps-scraper-extension-v1.0.zip`