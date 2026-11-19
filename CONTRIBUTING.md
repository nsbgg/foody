# Contributing

Use Node.js 22.19 or later and npm. The lockfile is committed; install with
`npm ci`. Run `npm run dev` for development. See [README](./README.md) for
the app's scope, offline behavior and server configuration.

Before submitting a change:

1. Keep each change focused and describe the user-visible behavior.
2. Add meaningful regression coverage for changes to synchronization, import,
   calculations or persistence. Use synthetic recipe and household data.
3. Run `npm run format:check`, `npm test`, `npm run build`, `npm run test:e2e`
   and `npm audit --audit-level=moderate`. The build includes TypeScript checks.
4. Update documentation when behavior, configuration or limitations change.
5. Review the staged diff for secrets, real household data, screenshots with
   personal content, machine paths and generated files before committing.

The browser tests use installed Microsoft Edge by default. For downloaded
Chromium, run `npx playwright install chromium`, then set
`PLAYWRIGHT_BROWSER=chromium` in your shell before `npm run test:e2e`.
On Linux, `npx playwright install --with-deps chromium` also installs system
dependencies. CI uses Chromium and a fresh isolated test database. Do not point
test configuration at a real household database.

Do not attach raw databases, browser storage exports, environment files, private
recipe URLs or credentials to issues. See [SECURITY](./SECURITY.md) for sensitive
reports. New dependencies must have compatible license terms; preserve their
notices and update [third-party notices](./THIRD_PARTY_NOTICES.md).

Repository licensing must be settled by the project owner before accepting
external contributions or publishing a release. Third-party packages retain
their own licenses regardless of the eventual project license.

After dependency changes, run `npm ci`, then
`node scripts/generate-notices.mjs` and review the regenerated notices.
`node scripts/generate-notices.mjs --check` verifies that the inventory matches
the current lockfile and installed files without writing. Optional native
packages differ by platform; regenerate and review on each release platform.
Missing or unavailable license texts are reported explicitly and need review
before redistributing those packages. The generator preserves upstream legal
attribution without recording machine paths, dates or environment values.

CI actions are pinned to immutable commit SHAs. When updating a pin, verify the
tag and commit against the official release and review the action runtime:
[checkout releases](https://github.com/actions/checkout/releases) and
[setup-node releases](https://github.com/actions/setup-node/releases).
