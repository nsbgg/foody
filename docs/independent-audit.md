# Independent public-repository audit

Reviewed the initial implementation on 2026-11-19. Findings below describe the
snapshot before follow-up fixes; this document is evidence of the review, not a
claim that every item remains open. Implementation and release-gate agents own
remediation and final verification.

## Confirmed correctness findings

1. **High: offline edits can disappear across browser tabs.** In the original
   `src/store.ts`, every tab owns a separate in-memory state but replaces the same
   IndexedDB key with its entire snapshot (`persist`, originally lines 25–32).
   An isolated harness executing the actual store source initialized two tabs
   offline, changed entity `tab-a` in one and `tab-b` in the other, and inspected
   the durable snapshot: only `tab-b` remained. Closing both tabs then loses the
   first unsynchronized edit, even though the entities differ. Add coordinated
   ownership or transactional cross-tab merging, with an offline two-tab reload
   regression test.
2. **High: a transient storage failure permanently stops persistence and sync.**
   The original `writes = writes.then(...)` chain stays rejected after one failed
   IndexedDB write. Later changes never invoke storage again; `sync()` also fails
   at `await writes`. An isolated harness made only the first write reject and
   then performed a second edit: the storage function was called once in total.
   Recover the queue while preserving a visible storage warning and dirty data;
   verify retry and eventual synchronization after storage becomes available.
3. **Medium: full-word units lose a factor of 1,000.** The original
   `shared/domain.ts` parser recognizes `kilogramm` and `liter` but returns the
   base unit without scaling the amount. Direct execution produced `1 g` from
   `1 Kilogramm Kartoffeln` and `1 ml` from `1 Liter Milch`. Preserve the intended
   unit or scale correctly and cover aliases in ingredient/shopping tests.
   Separately, editor initialization formats amounts to two decimals; avoid
   rounding stored quantities merely by opening and saving an existing recipe.

## Public repository and portability

- The original Node minimum was 22.18, while the locked direct dependency Undici
  8.12.4 requires at least 22.19.0. Align the documented and declared minimum with
  the actual dependency requirement and exercise it in CI.
- The initial Playwright configuration hardcodes Microsoft Edge. Provide a
  portable default with an explicit local browser override; exercise browser
  installation and the production build from a fresh checkout in CI.
- The original repository has no commit history, CI, contribution guidance or
  security reporting guidance. Add public maintenance essentials and review the
  license decision explicitly; absence of a license must not be described as an
  open-source permission grant.
- Generated design inspector reports contain machine-specific workspace paths.
  Keep generated reports/screenshots, local databases and backups, local
  configuration, credentials, traces and test artifacts out of commits. Inspect
  the actual staged candidate and its filenames before each commit. The ignore
  rules were being strengthened during this review.

## Security and lifecycle observations

- The importer already rejects private and mapped addresses, validates each
  redirect and pins checked DNS results to the actual connection. It caps
  decoded HTML at 2 MB and concurrent imports at three. No direct SSRF bypass
  was established in this review.
- DNS lookup happens before the per-fetch timeout; redirects get separate
  timeouts. Consider a whole-operation deadline and cancellation of unused
  response bodies as a bounded importer hardening block. Tests should exercise
  redirect validation, DNS pinning, large/slow responses and malformed metadata,
  rather than only testing the address classification helper.
- Comparing the request Origin host with the supplied Host alone does not
  reject DNS rebinding when both contain an attacker-controlled hostname.
  Browser private-network protections differ. Consider an explicit configured
  host/origin policy for loopback, LAN and reverse-proxy deployments. The
  agreed no-account household scope still requires private network access or a
  protected reverse proxy; source publication does not authorize public access
  to household data. A minimal policy regression sends an API request with
  `Host: rebind.invalid:4307` and `Origin: http://rebind.invalid:4307`: it must be
  rejected even though the two hosts match. A configured legitimate LAN host
  should have its own positive test. This tests the missing boundary without
  performing a live DNS attack.
- The service worker uses versioned app caches, excludes API requests, and offers
  a user-triggered update. Existing end-to-end tests cover offline reload but do
  not cover an update between two built app versions, pending offline changes
  during an update, or multiple open clients. Add meaningful lifecycle coverage
  before claiming these paths verified.

## Suggested topic blocks

1. Establish a sanitized baseline and portable public-repository checks.
2. Correct quantity parsing and lossless recipe editing.
3. Protect offline changes across tabs and recover from persistence failures.
4. Harden and test importer/request boundaries and PWA lifecycle.

After each block, independently inspect the diff, run its targeted regression
checks and the required project gates, update verification documentation, scan
the staged candidate for private material, and only then create its commit.

## Sync redesign review

An append-only durable outbox updated through an atomic IndexedDB transaction
can protect changes made by independent tabs. Preserve operation identity,
payload and base revision for idempotent retries. A dialog that has been open
while remote changes arrive must submit against the revision it actually
displayed; submitting its stale data against a newly observed revision would
silently overwrite a remote edit.

Do not batch dependent edits to the same entity indiscriminately. If local
operations A and B use projected base revisions 1 and 2, while another device
has already committed revision 2, submitting both allows A to conflict but B to
overwrite the remote version successfully. Send only the oldest unblocked
operation per entity in a round, and freeze its descendants on conflict until
an explicit resolution preserves the user's latest local variant. Include this
case and response-loss retries in the regression suite.
