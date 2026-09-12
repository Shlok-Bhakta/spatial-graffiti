# Agent notes

- iOS-only React Native (Expo SDK 57) Spatial Graffiti POC.
- Live AR stays in the `spatial-ar` native module (ARKit + RealityKit).
- Product UI, location, and HTTP live in TypeScript.
- Backend is Bun + SQLite under `server/`.
- Release archives embed the JS bundle. Do not ship a Metro-connected debug IPA.
- Do not use Expo Go.
