# Kiwi is x86_64. Compile for glibc Linux, then run the binary alone.
FROM --platform=linux/amd64 oven/bun:1.4.2 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
RUN bun install --frozen-lockfile \
  && bun test \
  && bun build --compile --target=bun-linux-x64-baseline ./src/index.ts --outfile ./dist/spatial-graffiti-server

# bun --compile still links glibc and libstdc++. scratch has neither, so the
# process never starts. distroless/cc is the smallest image that can run it.
FROM --platform=linux/amd64 gcr.io/distroless/cc-debian12
COPY --from=build --chmod=755 /app/dist/spatial-graffiti-server /spatial-graffiti-server
ENV PORT=3000
ENV DB_PATH=/data/graffiti.sqlite
EXPOSE 3000
ENTRYPOINT ["/spatial-graffiti-server"]
