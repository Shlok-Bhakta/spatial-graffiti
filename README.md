# Spatial Graffiti

Draw a colored line in the room. Kill the app. Open it again in the same place. The line should come back where you left it.

That is the whole experiment. GPS only finds the nearby site. ARKit relocalizes against a saved `ARWorldMap`. Stroke points are stored relative to one named root anchor, not the session origin.

Expo Go cannot run this. The camera is a local Swift module (`ARKit` + `RealityKit`). You need an Expo development build or the unsigned IPA from CI.

> [!WARNING]
> The backend has no accounts and no auth. Anyone who can reach the URL can write sites and strokes. The Kiwi deploy is on Tailscale for that reason.

```
┌──────────────────────────────┐
│ Expo React Native            │
│                              │
│ location + networking        │
│ color picker                 │
└──────────────┬───────────────┘
               │ Expo Module
┌──────────────▼───────────────┐
│ Swift                        │
│ ARKit + RealityKit           │
│                              │
│ ARSession                    │
│ raycasting                   │
│ fixed drawing planes         │
│ root anchor                  │
│ polyline renderer            │
│ ARWorldMap save/load         │
└──────────────┬───────────────┘
               │
               │ HTTP
               ▼
┌──────────────────────────────┐
│ Bun server                   │
│                              │
│ nearby-site discovery        │
│ world maps                   │
│ strokes                      │
│                              │
│ SQLite                       │
└──────────────────────────────┘
```

## Requirements

- Node 22+
- Bun 1.4+
- Xcode with an iOS 17+ SDK
- CocoaPods
- An iPhone. The simulator cannot prove relocalization.

## Backend

```sh
cd server
bun install
bun test
bun start
```

SQLite lives at `server/data/graffiti.sqlite` by default (`DB_PATH`). WAL writes sidecar files next to it. Persist the whole directory, not just the `.sqlite` file.

```sh
cd server
bun run build
./dist/spatial-graffiti-server
```

`bun run build` targets Linux x86_64 (`bun-linux-x64-baseline`). The database is opened at runtime from `$DB_PATH`. It is not compiled into the binary.

```sh
cd server
mkdir -p data
docker build -t spatial-graffiti-server .
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e DB_PATH=/data/graffiti.sqlite \
  -v "$(pwd)/data:/data" \
  spatial-graffiti-server
```

The runtime image is `gcr.io/distroless/cc-debian12`. A Bun compiled binary still needs glibc and libstdc++, so `scratch` does not boot.

## App

```sh
npm ci
```

Point the phone at the Mac's LAN address, not `localhost`:

```sh
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:3000
```

CI and the committed `.env` use the Kiwi Tailscale URL:

```
EXPO_PUBLIC_API_BASE_URL=http://kiwi.taildb44.ts.net:38420
```

```sh
CI=1 npx expo prebuild --platform ios
npx expo run:ios --configuration Release --device
```

Release archives embed the JS bundle. The IPA does not talk to Metro.

## Physical tests

The simulator can check UI and API code. It cannot prove AR.

1. Draw a line. Walk. The line stays in the room, not on the screen.
2. Stand within 1 m of a wall and draw. The stroke sits on the wall.
3. Point at open space and draw. The stroke sits on a plane about 1.5 m out.
4. Start an air stroke, then move the phone while drawing. The existing line does not warp with the camera.
5. Publish a site (wait until mapping is `mapped` or `extending` for several seconds). Kill the app. Reopen it in the same place. After relocalization the drawing returns.
6. A second iPhone on the same backend should find the site and see the same line.

The app keeps room maps and an append-only stroke journal in the phone's Documents directory. It retries uploads after relaunch. See [room recovery and its physical test](docs/LOCALIZATION.md).

## CI

Copied from [MB-QR-Code-Scanner](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner): npm + Expo prebuild + unsigned `xcodebuild` + Autoloader preview.

PRs publish `pr-<n>` with `Spatial-Graffiti-unsigned.ipa` and a GitHub Pages trampoline. See [docs/AUTOLOADER_DEV_CYCLE.md](docs/AUTOLOADER_DEV_CYCLE.md).

On `main`, only `fix:`, `feat:`, and `feat!:` titles build a tagless release artifact.

## Known limits

- No live multi-user stroke sync. A 10 second poll loads strokes already on the server.
- Relocalization can still fail when the room has changed or lacks visual features. The app offers room choices and does not silently replace the room.
- Older rooms have no Vision feature prints until someone visits them with a new build. Room choice falls back to the last used room and distance.
- AR persistence has to be tested on a phone. The agent cannot claim it passed from a simulator.
