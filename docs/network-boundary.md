# Network boundary

Foodie has one shared household and no user accounts. Anyone who can access its
server can read and edit household data. Keep the service inside a trusted
private network, or put an access-controlled HTTPS reverse proxy in front of it.
Publishing this source code does not publish the local household database.

The server accepts `localhost`, `127.0.0.1` and `::1` by default. For a LAN
address or public-facing reverse-proxy hostname, configure an exact comma-separated
hostname/IP allowlist before starting Node:

```sh
HOST=0.0.0.0 ALLOWED_HOSTS=kitchen.example,192.168.1.5 npm start
```

PowerShell:

```powershell
$env:HOST = '0.0.0.0'
$env:ALLOWED_HOSTS = 'kitchen.example,192.168.1.5'
npm start
```

Use the addresses of your own deployment. Entries contain no scheme, port,
path or wildcard. IPv6 addresses other than loopback use brackets. The list
applies to the configured listening port; it does not open extra server ports.
An invalid configuration stops startup with a configuration error.

Every request must use an allowed Host header. API requests with an Origin
header must also use the same hostname and port as that Host. Missing Origin
is allowed for command-line clients and normal same-origin reads; malformed,
`null`, foreign and mismatched origins receive HTTP 403. An attacker-controlled
hostname receives HTTP 403 even if its Origin matches it, which closes the
previous Host/Origin equality gap for DNS rebinding.

The default Vite development proxy preserves the incoming Host and Origin, so
`localhost:5173` works without additional configuration. Tests use
`localhost:3002`. These are loopback hostnames, not arbitrary trusted origins.

A reverse proxy must preserve the original public Host and be configured to
accept only the intended deployment names. Add those names to `ALLOWED_HOSTS`.
The application does not trust `Forwarded` or `X-Forwarded-Host` to bypass the
allowlist. TLS may terminate at that proxy: the browser's HTTPS Origin is checked
against the preserved Host without relying on an untrusted forwarded protocol.

This host boundary limits web-origin attacks; it is not authentication or an
access-control replacement. Installation and offline PWA features on other
devices still require HTTPS.

JSON request bodies are limited to 8 MiB so a schema-valid recipe with many
Unicode cooking steps can synchronize. Larger requests return HTTP 413;
malformed JSON returns HTTP 400. The sync schema additionally caps a request at
100 operations. Client synchronization should split larger queues into bounded
batches rather than retrying an oversized request unchanged.

Chefkoch imports use the same DNS-pinned, time- and size-limited downloader as
other recipe imports. The `chefkoch-api` package is used only for its recipe and
ingredient objects and text normalization; its unbounded network/crawling and
file-writing methods are never invoked. The adapter reads the downloaded page
locally, and only for exact `chefkoch.de` / `www.chefkoch.de` recipe URLs after
redirect validation. It never follows recipe category, tag or image links.
Structured recipe metadata takes priority; the Chefkoch adapter fills missing
fields from the recipe page. No cookies, accounts or browser automation are used.
