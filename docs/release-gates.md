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

## Block 6: Scoped cooking scrollbar suppression

Reviewed on 2026-11-20 after timer commit `635568e`. Scope: cooking-only scrollbar CSS, design documentation and strengthened cooking-layout assertions.

- **Independent checks:** all 52 unit/API tests and all 25 Edge browser scenarios passed; TypeScript and production/PWA build passed; formatting passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities. No dependencies changed.
- **Behavior review:** the root page hides its scrollbar only while the fullscreen cooking modal is active. Cooking and ingredient/timer dialogs hide their own scrollbars with the standard property and a WebKit fallback; hidden overflow retains overscroll containment. No general page-wide scrollbar suppression was introduced.
- **Browser evidence:** five viewport scenarios assert hidden root/cooking scrollbar styles and restoration of the previous root style after Escape. Optional ingredient and timer panels assert hidden scrollbar/overflow styles. Existing exact reconstruction of all 5,000 instruction characters, no-overflow geometry, stable wheel scroll positions, reachable ingredient pages, timer lifecycle and Axe checks all still pass.
- **Documentation/privacy:** the design note accurately limits the change to cooking and its tools. Only source, synthetic tests and documentation are staged; generated screenshots and runtime data remain excluded. Candidate paths and contents contain no private operator identifiers, machine paths, credentials or private service links.
- **Limits:** runtime checks used Edge; the WebKit fallback was source-reviewed, not tested on a physical Safari/iOS device. Prior deployment, licensing and publication limits remain in effect.

## Block 7: Contextual timers derived from recipe steps

Reviewed on 2026-11-20 after scrollbar commit `aea24a2`. Scope: duration extraction, conditional cooking timer visibility and prefilling, second-precision duration controls, compact source-duration selection, browser/unit regressions and design documentation.

- **Independent checks:** all 60 unit/API tests and all 27 Edge browser scenarios passed; TypeScript and production/PWA build passed; formatting passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities. No dependencies changed.
- **Behavior review:** idle timer controls appear only for recognized current-step durations. Opening or resetting an idle timer selects the first source duration; multiple durations use a native labeled selector. Starting remains manual. Existing running/paused/finished timers remain accessible through step changes; ending closes the panel and removes the chip from untimed steps.
- **Parser/security review:** fixed Unicode-aware patterns parse explicit units, decimal/fractional quantities, selected singular/half-hour forms, ranges and adjacent descending units. Results are deduplicated and bounded to 1 through 86,400 seconds. Zero/negative/invalid/oversized inputs and unitless numbers are rejected. Labels remain plain source text rendered through React; no HTML evaluation, network access, native intent or new persistence sink is introduced. Existing guarded JSON reads and finite/range checks remain in place for persisted cooking state.
- **Regression evidence:** eight duration-parser tests pass. Browser checks cover absent untimed controls, one-minute prefilling/reset, second precision, two source-duration choices on small and landscape screens, active timer retention across steps, pause/reload/resume, expiry and conditional disappearance after ending. Existing five-viewport long-text geometry, scrollbar restoration, ingredient paging and security/offline regressions still pass. Timer accessibility scans report no Axe violations.
- **Documentation/privacy:** design notes state the contextual rules, upper duration for ranges and manual start. Candidate content and paths contain synthetic fixtures only; no private operator identifiers, machine paths, credentials/private service links or runtime/generated data found. Screenshots remain ignored test output.
- **Limits:** natural-language recognition deliberately covers explicit supported forms, not arbitrary prose. Internal-timer/background-alarm, physical-device, hosted-CI, licensing and publication limits remain unchanged.

## Block 8: Chefkoch recipe import adapter

Reviewed on 2026-11-20 after contextual-timer commit `50fcc3d`. Scope: exact pinned `chefkoch-api` dependency and lockfile/notices, local provider adapter, shared import dispatch, missing-field fallback, importer wording, synthetic tests and setup/network documentation.

- **Independent checks:** all 67 unit/API tests and all 27 Edge browser scenarios passed; TypeScript and production/PWA build passed; formatting passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities. Notice generation `--check` matches all 528 locked package entries.
- **Clean dependency check:** exported only indexed candidate files into a new isolated temporary directory. Fresh `npm ci --prefer-offline --no-fund` installed 454 packages and audited 455 with zero known vulnerabilities. All seven Chefkoch tests and the 528-entry notice check passed again against that clean installation.
- **Security/network review:** the actual package constructor, models and text normalizer were inspected; the used paths issue no network/file operations. Foodie downloads through the existing bounded, DNS-pinned fetcher exactly once, selects fallback by the final validated exact Chefkoch recipe hostname/path, and never follows category, image, search or crawler links. HTTP(S) image fields remain optional. JSON-LD fields take precedence; locally parsed provider fields fill missing values. Untrusted page text is returned as text for the existing editor/rendering path.
- **Regression evidence:** synthetic tests cover spoofed provider hosts, classic markup, partial pages, structured-field precedence, final redirect URL dispatch, preserved generic import support, one-fetch behavior with forbidden package network methods mocked to fail, and inert text/unsafe optional image rejection. Existing importer deadline/cleanup, private-address, API origin and browser rendering checks remain green. No live external recipe content was saved as a fixture or seed.
- **Dependency/licensing review:** `chefkoch-api` is pinned to 1.2.2 and documented as upstream-deprecated. All new lockfile downloads use the public npm registry. Required public upstream attribution is preserved. The inventory explicitly marks absent standalone notice files for `chefkoch-api` (ISC metadata) and `data-uri-to-buffer` (MIT metadata); these need upstream notice review before redistributing their binaries. `htmlparser` supplies its complete license text despite missing package license metadata. This local source commit does not resolve the separate project-license decision or authorize public distribution.
- **Documentation/privacy:** README explains individual-link import, editor review before saving and website compatibility limits; the network note states that unsafe package methods are unused. Candidate filenames and contents were checked for private operator paths/identifiers, credentials, private service URLs and runtime/generated data; no private material found. Fixtures use synthetic recipe contents; public upstream legal contacts are expected attribution.
- **Limits:** website markup and access restrictions may change. The integration is unofficial and does not use accounts, cookies, bulk scraping or browser automation. Hosted CI, physical-device checks and publication remain outside this local gate.

## Block 9: Readable cooking instructions with compact highlighted quantities

Reviewed on 2026-11-20 after Chefkoch commit `d2634ca`. Scope: compact quantity prefixes and safe semantic ingredient segments, sentence spacing, matching measurement/rendering fragments, cooking regression tests and design documentation.

- **Independent checks:** all 73 unit/API tests and all 31 Edge browser scenarios passed; TypeScript and production/PWA build passed; formatting passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities. Dependencies did not change.
- **Quantity/readability review:** unambiguous quantities precede ingredient names, compacting weight/volume units and omitting counted-piece labels. Explicit authored quantities stay unchanged. Recognized partial directions suppress inferred totals, unknown quantities remain unfilled, and ambiguous aliases remain unmarked. Ingredient names, including repeated/unknown-amount mentions, receive semantic `mark` elements. Sentence blocks add quiet spacing; no automatic navigation, extra motion or flashing is introduced. This implements the requested readability preference without claiming a clinical benefit.
- **Rendering/security review:** visible React text and the measurement probe use the same sentence/ingredient fragment generator and CSS. The probe constructs constant-tag elements with `createElement`, `createTextNode`, `textContent` and `replaceChildren`; no HTML parsing/evaluation sink is added. Grapheme boundaries are mapped to UTF-16 offsets and the final shortened page is remeasured to avoid clipping after sentence breaks.
- **Regression evidence:** all 17 cooking-quantity helper tests pass, including explicit amounts, partial references, safe plain text, ambiguous names and segmentation. Four multilingual browser scenarios reconstruct every transformed character at desktop, small mobile, landscape and zoom-equivalent layouts, assert marks and navigation remain visible, verify no overflow and retain unchanged stored recipe data. Existing 5,000-character paging, timer lifecycle, scrollbar restoration, offline and security scenarios still pass. Axe scans report no violations on the exercised cooking views.
- **Documentation/privacy:** design notes describe the compact format, highlighting and conservative partial-quantity behavior. Candidate paths and contents contain source and synthetic fixtures only; no private operator identifiers, machine paths, credentials/private service links or runtime/generated artifacts found. Screenshots remain ignored test output.
- **Limits:** ingredient/partial-language recognition remains deliberately conservative; physical-device/Safari, hosted-CI, licensing and publication limitations from earlier blocks remain unchanged.

## Block 10: Unambiguous display-awake status

Reviewed on 2026-11-20 after readability commit `22fb42c`. Scope: cooking display-status text/icons, semantic CSS selector, synthetic wake-lock browser coverage and design documentation.

- **Independent checks:** all 73 unit/API tests and all 34 Edge browser scenarios passed; TypeScript and production/PWA build passed; formatting passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities. Dependencies did not change.
- **Behavior/accessibility review:** the ambiguous sun/moon imagery is replaced by monitor icons with visible text: active screen lock reports that the display stays on; unavailable/rejected/released locks report that the display may go off. The element is a noninteractive `status` with a supplemental explanation, not a theme control. Existing wake-lock acquisition/release behavior and permissions remain unchanged.
- **Browser evidence:** three focused 320x568 scenarios exercise acquired-lock status and release, unsupported API, and permission rejection using synthetic browser API stubs. They verify truthful text, absence of sun/moon/button semantics, viewport containment and no dialog overflow. All existing long-text, highlighted ingredient, timer, accessibility, offline and security regressions still pass.
- **Documentation/privacy:** the design note explains the status meaning and polite announcements. Source and synthetic tests contain no private operator identifiers, machine paths, credentials/private service links or runtime/generated data. The mobile screenshot remains under ignored test output.
- **Limits:** synthetic API tests verify UI responses, not a hardware guarantee that every operating system will keep its screen awake. Existing physical-device, deployment, licensing and publication limits remain unchanged.

## Block 11: Cooking completion screen and clear next actions

Reviewed on 2026-11-20 after display-status commit `ca1f50d`. Scope: a dedicated completion component with original inline SVG, completion-only responsive layout, restart/weekly-plan actions, browser regressions and design documentation.

- **Independent checks:** all 73 unit/API tests and all 39 Edge browser scenarios passed; TypeScript and production/PWA build passed; formatting passed; `npm audit --audit-level=moderate` reported zero known vulnerabilities. No dependencies or external image assets were added.
- **Behavior/design review:** completion presents a decorative plate/leaf illustration, heading and short status copy in the existing palette. A definite-size cooking-stage container switches the composition at low heights; tiny screens stack both full-width completion actions. No animation, confetti or automatic navigation is introduced. Restart resets only the recipe step; the weekly-plan action closes cooking and selects the weekly view. Running timer state remains unchanged and reachable in the header.
- **Browser evidence:** five completion scenarios at desktop, 320x568, landscape, zoom-equivalent and mobile dimensions verify visible artwork/copy/actions, zero dialog overflow, semantic status and decorative SVG, restart and weekly-plan navigation. The desktop case retains an active timer. All five completion Axe scans report no violations; existing text-paging, ingredient highlighting, timer, wake-lock, offline and security regressions remain green.
- **Security/privacy review:** the new SVG and copy are constant local markup; no untrusted HTML, network request, persistence boundary or additional permission is introduced. Scoped candidate files and synthetic fixtures contain no private operator identifiers, machine paths, credentials/private service links or runtime/generated artifacts. Screenshots remain ignored test output.
- **Documentation/limits:** design notes describe the layout and both actions accurately. Prior physical-device, hosted-CI, dependency-notice, project-license and publication limits remain unchanged.
