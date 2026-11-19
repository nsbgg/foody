# Security review

Review date: 2026-11-19. Scope: the local household application's source and Git history, API input boundaries, SQLite queries, recipe import, client rendering, service worker and dependency inventory. Review uses the `security-review` skill with independent implementation review and a separate release gate. It is not an external penetration test or a guarantee of absence of vulnerabilities.

## Threat model

The application deliberately has no accounts. Anyone with network access to its configured server can read and modify household data. The supported boundary is a trusted private network or an authenticated HTTPS reverse proxy. Source-code publication does not make an unauthenticated public deployment safe. Review includes malicious imported pages, hostile websites visited in the same browser, and malformed input submitted to the trusted API.

## Findings and remediation

| Severity              | Finding                                                                                                                                                                                                                                               | Remediation and regression coverage                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium                | Nested API schemas were checked with `safeParse`, but their parsed output was discarded. Unknown fields could be persisted. A synthetic check containing a `title` field could be mistaken for a recipe by the conflict renderer and crash that view. | Persist the parsed discriminated data and render conflicts using the explicit entity kind. Synthetic validation and rendering tests cover the boundary.                                                  |
| Medium                | The application allowed framing. A hostile page could embed the household UI and attempt to trick a user into operating it.                                                                                                                           | Enforce `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`. HTTP assertions and a real browser framing attempt verify rejection.                                              |
| Medium / availability | Import DNS resolution was outside the fetch timeout, each redirect restarted the budget, and graceful dispatcher closing could wait on discarded response bodies. Three long-running imports could occupy all available import slots.                 | A single operation deadline covers resolution, redirects and reading; discarded bodies and dispatchers are cleaned up on failure. Deterministic synthetic transport tests verify the budget and cleanup. |
| Low                   | Import failures returned arbitrary exception messages, potentially exposing DNS names or internal transport/parser details.                                                                                                                           | Only controlled `ImportError` messages reach the client; unexpected errors receive a generic response.                                                                                                   |

## Controls examined

- Host allowlist and strict request-Origin checks reject matching attacker Host/Origin values, opaque origins and foreign origins before API handling. Public URLs are resolved and all returned addresses checked; the validated address is pinned to the actual connection. Every redirect is revalidated.
- SQLite values use prepared parameterized statements. Entity revisions and operation identifiers prevent silent overwrites and make retries idempotent. A durable transactional IndexedDB outbox handles multiple tabs and temporary write failures.
- React renders recipe contents as text. No application `dangerouslySetInnerHTML`, dynamic evaluation or DOM HTML sink was found. Source links and recipe images are restricted to HTTP(S) by their renderers. Images may still contact third-party hosts; source URLs can be sensitive.
- API responses are not cached by the service worker and use `Cache-Control: no-store`. App assets and requested images are cached separately. Browser cooking progress contains step and timer state, not credentials.
- Existing limits include an 8 MiB JSON body, at most 100 sync operations per request, bounded recipe fields, a 2 MB decoded import body, redirect limits and three simultaneous imports. These reduce individual-request costs; they are not authentication, persistent storage quotas or a general request-rate limit.
- Runtime databases, environment files, design reports, browser traces and installed/generated files are excluded from tracked source. Git-history and candidate scans check for credentials, private operator paths and identifiers. Public upstream copyright attribution is retained.

## Residual risks and verification limits

- Strict script CSP, Trusted Types and deployment-wide request rate/storage quotas remain follow-up defenses. The CSP introduced here protects framing only; it does not claim to prevent script injection. No script-evaluation exceptions were added.
- TLS, access control, HTTPS-only policy and proxy limits belong to the deployment boundary. Automatic HSTS is not enabled on the local HTTP development server.
- No destructive attacks against external services or a real household were performed. DNS and network failure scenarios use controlled test doubles. Real iOS installation, cross-version service-worker upgrades and the hosted GitHub CI remain separate verification work.
- Browser storage can be evicted; server backups remain necessary. Imported recipes and external images are untrusted content and may have their own privacy and copyright implications.

## Verification evidence

Actual test counts, dependency-audit results, private-data review and commit approval for this block are recorded by the independent reviewer in [release-gates.md](./release-gates.md). Earlier counts are not treated as evidence for this revision.

## Reference material

The framing policy follows the [OWASP CSP cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html). Import cleanup is checked against the [official Undici dispatcher lifecycle documentation](https://github.com/nodejs/undici/blob/main/docs/docs/api/Dispatcher.md). The Modern Web Guidance `security` guide was consulted for phase-one framing protection; full strict CSP enforcement is explicitly not claimed.
