# Security

The [security review](./docs/security-review.md) records the threat model,
confirmed findings, fixes, regression coverage and remaining limitations.

Foody authenticates accounts using passwords or WebAuthn passkeys. Household
membership is checked on every data request, and mutations require CSRF tokens.
Sessions use opaque HttpOnly SameSite cookies; passwords use salted scrypt.
Passkeys require user verification, purpose/session-bound single-use challenges,
and matching RP ID and origin. Deployment requires HTTPS and explicit origin,
RP ID and hostname configuration; see [account deployment](./docs/accounts-api.md).
Email verification and password recovery are not implemented. Invitations are
shared directly by household owners; Foody does not send email.

Browser recipe caches and offline changes are private to each account and
household. They are not encrypted at rest; device/browser access is a separate
trust boundary. Offline access expires after at most twelve hours since online
verification and never outlives the server session. Signing out removes local
private account data. Legacy data is retained without a public claim endpoint.

Recipe import accepts public HTTP/HTTPS pages with structured recipe data. It
validates destinations and redirects to reduce server-side request forgery.
Keep dependencies updated and report any way to bypass these checks. Imported
URLs, images, recipes, logs, local browser storage and databases may contain
personal information. Review them before sharing a report or backup.

## Reporting a vulnerability

Do not open a public issue containing exploit details, secrets or household
data. If this repository enables GitHub private vulnerability reporting, use
its **Security → Report a vulnerability** action. Otherwise ask a maintainer
for a private reporting channel without posting the sensitive details. No
private reporting address or response-time commitment is currently configured.

Include affected versions, a minimal synthetic reproduction, expected and
observed behavior, and impact. There is no formal supported release schedule;
report against the latest revision when possible.

## Before public publication

Enable private vulnerability reporting and dependency/security alerts in the
repository settings. Review both tracked files and commit history for private
data; `.gitignore` does not remove information already committed. Never upload
the ignored database, reports, credentials or local environment files.
