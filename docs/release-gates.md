# Release gates

Each completed topic block is reviewed by a dedicated release-gate agent before a local commit is created. No remote publication is part of this process.

## Required checks per block

1. Review the exact file scope and diff, including changed behavior and regression risks.
2. Run applicable automated tests, TypeScript/production build, formatting checks and dependency audit. Run browser tests when user flows, offline behavior or CI setup change.
3. Verify setup, behavior, limits and test evidence are documented accurately.
4. Inspect candidate file contents and paths for secrets, credentials, personal identifiers, private links, machine-specific paths and household data.
5. Confirm generated output, local configuration, environment files, databases, screenshots and test artifacts are excluded from Git.
6. Stage only the reviewed scope and this gate record; inspect the complete staged diff and file list again.
7. Create a new Conventional Commit only after all applicable checks pass, preserving hooks and signing settings. Use a project contributor identity for author and committer metadata.
8. Verify the resulting commit and report its identifier and any remaining work. Never amend, push or publish implicitly.

A pattern scan is a review aid, not proof that no sensitive data exists. Findings require manual assessment; failing checks block a commit until resolved. Test records describe actual executions, not inferred success.

## Initial repository assessment

- A local repository was initialized on `main`; no remote was configured.
- Household SQLite data, installed dependencies, build output and browser-test output must remain untracked.
- Ignore rules must cover all local design scratch files, environment files, credential/key files and temporary output before the initial commit.
- Source and documentation initially inspected contain no obvious personal names or machine-specific home-directory paths. Final approval applies only to the staged content reviewed for each block.
- Public dependency registry links and synthetic `example.com` fixtures are expected. Real imported recipe contents are not seed data.

## Completed gate records

The records below describe completed, independently executed gate checks.

## Block 1: Correctness-hardened runtime baseline

Reviewed on 2026-11-19 before the initial local commit. Scope: application source, shared domain rules, backend, tests, build configuration, icons, startup documentation and implementation/audit notes. Repository maintenance files and third-party notice generation are a separate block.

- **Independent checks:** `npm test` passed all 27 unit/API tests; `npm run build` passed TypeScript and production/PWA build; `npm run test:e2e` passed all 12 Edge scenarios; `npm run format:check` passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities.
- **Review focus:** atomic cross-tab IndexedDB outbox, recovery after a failed write, immutable operation identity and revision, dependent operation ordering, stale conflict choices, lossless quantities and unit aliases, recipe snapshots, host/origin allowlist, bounded JSON bodies and sanitized unexpected-error logging.
- **Privacy review:** candidate paths and contents scanned for personal machine paths, operator identifiers, credentials/key patterns, private service links and household databases. No private material found in the reviewed candidate. Public dependency metadata, synthetic fixtures and public documentation links are expected. Generated build/test/design output and runtime data are ignored and excluded.
- **Documentation:** setup and Node minimum now match locked dependencies; offline integrity, quantity integrity and deployment boundary are documented. Earlier verification results remain explicitly historical; the counts above are fresh executions by the release-gate agent.
- **Nonblocking limits:** SQLite emits its upstream experimental warning; the PWA build emits an upstream bundler option deprecation warning. Browser checks ran in Edge on the local platform. iOS installation, cross-version service-worker upgrades and hosted CI are not claimed as verified. Importer-wide deadlines remain follow-up hardening beyond per-fetch timeouts.
- **Publication status:** no remote or public repository is created. A project license decision is pending; this gate is approval for a local source commit, not a claim of an open-source license grant.

## Block 2: Public repository maintenance and clean-checkout checks

Reviewed on 2026-11-19 after baseline commit `c6e72b3`. Scope: pinned CI workflow, editor/line-ending settings, Node version reference, environment example, contribution/security guidance, generated third-party notices and their generator, README links and formatter coverage.

- **Clean candidate export:** exported only the Git index into a new isolated temporary directory. A fresh `npm ci --prefer-offline --no-fund` installed 444 packages and audited 445 with zero known vulnerabilities. No existing working-directory dependencies, runtime data or generated output were copied.
- **Independent clean-install checks:** all 27 unit/API tests passed; TypeScript and production/PWA build passed; all 12 Edge browser scenarios passed; formatting including the CI workflow passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities. Executed with Node.js 22.23.4 and npm 10.9.9 on Windows.
- **Notice verification:** `node scripts/generate-notices.mjs --check` passed in both the working directory and clean installation for all 518 locked package entries. Optional unavailable packages are identified explicitly; complete installed notice texts retain public upstream copyright names and contact details. These are legal attribution, not private household/operator information.
- **CI review:** workflow uses read-only repository permissions, immutable action commit pins, disabled checkout credential persistence and a Node.js 22.19/24 matrix with Chromium installation. Hosted GitHub execution and the Linux/Node 24 matrix have not run here; local checks do not claim otherwise.
- **Privacy review:** all 57 indexed candidate files were scanned, including the notice inventory, for personal machine paths, operator identifiers, private service links and credential/key patterns; no private material found. The environment example contains only local defaults and an empty host allowlist. Ignored household databases, dependencies, builds and test artifacts remain excluded.
- **Publication status:** repository contents are prepared for public-source review. The project license remains an owner decision; no license grant, GitHub repository creation, remote configuration or push occurred. Configure private vulnerability reporting and security alerts on GitHub before publication.

## Block 3: Security review and defensive input/import handling

Reviewed on 2026-11-19 after packaging commit `5ad11c9`. Scope: API nested-value parsing, defensive conflict rendering, anti-framing headers, import deadlines and resource cleanup, controlled import errors, targeted regression tests, security documentation and this gate record.

- **Independent checks:** `npm test` passed all 41 unit/API tests; `npm run build` passed TypeScript and production/PWA build; `npm run test:e2e` passed all 15 Edge scenarios; `npm run format:check` passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities. Dependencies and the lockfile did not change.
- **Input/rendering review:** the discriminated operation schema now returns parsed nested values rather than retaining unchecked metadata. Conflict rendering selects schemas and views by entity kind and displays untrusted recipe text through React. Tests demonstrate unknown fields do not persist, legacy poisoned check metadata does not crash comparison, and markup/unsafe source URLs are not executed or linked.
- **Importer review:** every redirect revalidates URL and all DNS answers; connection lookup uses the validated address. One deadline bounds the caller across resolution, redirects and complete body reads. Every created dispatcher is destroyed; discarded bodies are canceled without awaiting a hostile stream's cancellation. Errors exposed to the API are controlled messages. Twelve synthetic transport tests cover mixed/private DNS answers, actual pin callback, redirect limits, slow DNS/request/body, error/oversized response cleanup and error sanitization.
- **Deadline limit:** `node:dns.lookup` itself is not cancelable. The deadline bounds the caller and releases the import slot; it does not claim to terminate underlying operating-system DNS resolution. A general request-rate or storage quota is outside the agreed trusted-household scope.
- **Framing review:** CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY` are asserted at HTTP level and by a browser attempting to frame the application. This policy does not claim strict script CSP or Trusted Types coverage.
- **Documentation/privacy:** the security report states the no-account private-network/reverse-proxy boundary, concrete remediations and remaining limits. Candidate files contain only synthetic attack fixtures. Staged content and Git history were checked for private operator identifiers, machine paths, credentials, private service links and generated/runtime data; no private material found. Public upstream attribution is preserved.
- **Remaining verification:** hosted CI, real iOS installation and cross-version service-worker upgrades remain unverified. No external service was attacked, no household data was used, and no repository publication occurred. The owner has not selected a project license.

## Block 4: Full-viewport cooking without scrolling

Reviewed on 2026-11-19 after security commit `395d532`. Scope: cooking dialog integration, responsive viewport layout, measured text/ingredient pagination, optional native panels, geometry/accessibility regression tests and user/design documentation.

- **Independent checks:** all 41 unit/API tests and all 21 Edge browser scenarios passed; TypeScript and the latest production/PWA build passed; formatting passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities. Dependencies did not change.
- **Geometry and content review:** the native cooking dialog fills the browser/PWA content viewport. Measured pagination uses the displayed typography and grapheme boundaries, retains text, responds to resize/font completion and avoids shrinking step text below the tested 20-pixel minimum. Navigation remains outside the paged text region. The dialog-close handler ignores nested panel close events.
- **Meaningful browser evidence:** a 5,000-character step is reconstructed exactly from every page at 1440x900, 390x844, 844x390, 320x568 and 720x450. Geometry assertions verify viewport coverage, text/nav containment, no horizontal or vertical overflow and stable scroll positions after a wheel gesture. The 720x450 layout is a 200-percent-zoom-equivalent reflow check, not a claim of browser zoom API testing.
- **Optional panels and continuity:** a 60-item ingredient list remains fully reachable through pages on a small viewport; timer controls remain visible, a started deadline is stored and the active timer does not displace step controls. Escape closes the cooking dialog, reopening restores the saved step, and closing an inner panel returns to the cooking step. Axe scans of the ingredient panel, timer panel and active cooking view reported no violations.
- **Documentation/privacy:** README and design notes describe content-viewport fullscreen and optional paged tools accurately. New fixtures are synthetic; generated screenshots remain under ignored test output. Candidate content and filenames were checked for private identifiers, machine paths, credential patterns, private service URLs and runtime/generated artifacts; no private material found.
- **Limits:** fullscreen here fills the application viewport and does not hide browser chrome through the Fullscreen API. Physical mobile safe-area/keyboard behavior and real iOS installation remain separate device checks. Existing deployment, licensing and hosted-CI limitations still apply; no remote publication occurred.

## Block 5: Inline recipe quantities and a durable minimizable timer

Reviewed on 2026-11-20 after cooking-layout commit `41e46d9`. Scope: conservative cooking-step quantity enrichment, dedicated timer component and lifecycle state, responsive timer styling, development proxy preservation, targeted regression tests and user/design documentation.

- **Independent checks:** all 52 unit/API tests and all 25 Edge browser scenarios passed against the latest rebuilt UI; TypeScript and production/PWA build passed; formatting passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities. No dependency or lockfile changes.
- **Quantity review:** whole Unicode ingredient names and explicit small alias sets receive a scaled total-recipe amount in plain text. Unknown amounts, ambiguous aliases and adjacent explicit prose quantities are retained. Original recipes and planned snapshots remain unchanged. Eleven helper tests cover scaling, Unicode/regex characters, conservative aliases, ambiguity, explicit quantities, partial directions, idempotence and tiny amounts; a browser test verifies planned portions and unchanged stored data.
- **Timer review:** absolute deadlines, original duration and paused seconds persist locally. Start/pause/resume/reset/end/minimize controls have explicit labels. The clock ring has a native progress equivalent; minimizing exposes remaining time and paused state in the header. Desktop, 320x568 and 844x390 browser tests verify visible controls, no timer overflow, pause across reload, resumed expiry, accessible state, reset, long 1,440-minute durations and nonoverlapping header controls. Axe scans in the tested timer layouts report no violations. Existing long-step and ingredient pagination checks still pass.
- **Development proxy:** independently sent a health read and an empty sync request through the running development server with its same-origin header; both returned HTTP 200. A foreign-origin empty sync returned HTTP 403. No operations were submitted and no household data was changed. Explicit `changeOrigin: false` preserves the browser authority for the backend boundary.
- **Documentation and platform limits:** documentation identifies inserted quantities as recipe totals and describes the internal timer fallback honestly. A standard PWA has no verified cross-platform API here to start and confirm the operating-system default timer. No native bridge, successful native timer launch or background alarm is claimed; visible expiry requires the application to be open.
- **Privacy:** scoped candidate paths and contents were reviewed for operator identifiers, machine paths, secrets/private service links and runtime/generated artifacts. Fixtures are synthetic and screenshots remain ignored test output; no private material found. Existing publication, project-license, hosted-CI and physical-device verification limitations remain unchanged.
