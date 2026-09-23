# Spatial Graffiti server

Bun HTTP API with an external SQLite file. The compiled binary never embeds the database.

## Commands

```sh
bun install
bun test
bunx tsc --noEmit
bun run dev
bun start
bun run build
```

`bun run build` writes `dist/spatial-graffiti-server` for Linux x86_64 (Kiwi). Use `bun run build:arm64` for aarch64.

`PORT` defaults to 3000. `DB_PATH` defaults to `./data/graffiti.sqlite`. The process binds `0.0.0.0` and creates the database directory when the filesystem allows it.

The server also stores up to eight Vision feature prints per site at `GET` and `POST /v1/sites/:id/feature-prints`. Existing SQLite files gain this table on startup. Nearby discovery excludes world map blobs smaller than 1 KiB, which cannot be useful ARKit maps.

## Docker

Create `./data` on the host first. The image will not mkdir `/data` on a locked root.

```sh
mkdir -p data
docker compose up --build
```

```sh
mkdir -p data
docker build -t spatial-graffiti-server .
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e DB_PATH=/data/graffiti.sqlite \
  -v "$(pwd)/data:/data" \
  spatial-graffiti-server
```

The runtime image is `gcr.io/distroless/cc-debian12`, not scratch. `bun build --compile --target=bun-linux-x64-baseline` still needs glibc and libstdc++. scratch has neither, so the binary never starts.
