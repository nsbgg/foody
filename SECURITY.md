# Security

Foodie currently has no user accounts or authorization. Anyone able to reach
the server can read and change household data. The default listener is local;
use a trusted private network or an authenticated HTTPS reverse proxy when
sharing it with other devices. Do not expose an unauthenticated instance to
the public internet.

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
