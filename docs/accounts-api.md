# Accounts and household API

The existing API uses JSON request/response objects and German error messages.
Failures return `{error: string, code?: string}` with an appropriate HTTP status.
Data responses, session cookies and invitation codes must never be cached.

## Sessions and deployment

`GET /api/session` is the anonymous-safe bootstrap. It returns
`{user, households, activeHouseholdId, csrfToken}`. Authentication uses an opaque,
HTTP-only SameSite session cookie, never a bearer token in local storage.
Every mutating request must include `X-CSRF-Token` obtained from the session.
Production deployments require HTTPS, a stable public `APP_ORIGIN`, the matching
`WEBAUTHN_RP_ID` hostname (without scheme/port), and `ALLOWED_HOSTS`.
Keep `DATA_DIR` persistent and private: it contains `accounts.sqlite` and
`foodie.sqlite`, which must be backed up together. Do not expose these files
through a static server. `HOST` and `PORT` configure the backend listener.

Sessions expire after seven days. Authenticated passkey management requires a
login within the last ten minutes; otherwise sign in again. Passwords require
12–256 characters and use asynchronous salted scrypt. Authentication attempts
are limited persistently by IP and normalized email. Bootstrap requests are
also rate limited. Proxy forwarding headers are not trusted by default.

Authorization and CSRF checks never create anonymous sessions for absent,
forged or expired cookies. The rate-limited session bootstrap creates anonymous
sessions; successful authentication and logout rotate an existing session.
Logout requires a currently authenticated session and valid CSRF, but remains
available when login, session-read or passkey-management limits are exhausted.
Replaying the revoked cookie or retrying logout anonymously returns 401 without
creating a replacement session.

| Method | Path                                        | Request                 |
| ------ | ------------------------------------------- | ----------------------- |
| POST   | `/api/auth/register`                        | `{name,email,password}` |
| POST   | `/api/auth/login`                           | `{email,password}`      |
| POST   | `/api/auth/logout`                          | `{}`                    |
| POST   | `/api/auth/passkeys/registration/options`   | `{}`                    |
| POST   | `/api/auth/passkeys/registration/verify`    | `{response,name}`       |
| POST   | `/api/auth/passkeys/authentication/options` | `{}`                    |
| POST   | `/api/auth/passkeys/authentication/verify`  | `{response}`            |
| GET    | `/api/auth/passkeys`                        | —                       |
| DELETE | `/api/auth/passkeys/:id`                    | —                       |

Options endpoints return SimpleWebAuthn options JSON directly. Authentication
responses return the session view, including its expiry timestamp `expiresAt`.
Registration uses discoverable credentials and requires user verification.
Email verification, password recovery and email delivery are not implemented.

Offline browser state is namespaced by user and household. A cached session
view contains public account metadata and a CSRF token, never a password,
session bearer credential or passkey private key. It allows local offline access
for at most twelve hours after successful online verification, bounded by session
expiry. This limit also applies to open tabs. A server denial immediately hides
the scope and invalidates offline identity metadata. Pending drafts remain
recoverable in their original namespace. Signing out clears private browser data
for that account and notifies other open tabs; it requires a server connection.

## Household resources

All routes below require authentication (401 otherwise), and mutation requires
valid CSRF (403 otherwise). Unknown/inaccessible households return the same 404;
membership is rechecked on every request. Standard private API traffic is limited
to 240 requests per user/minute (429 with `Retry-After`).

| Method | Path                                            | Request                    | Response                                      |
| ------ | ----------------------------------------------- | -------------------------- | --------------------------------------------- |
| GET    | `/api/households`                               | —                          | `{households: [{id,name,role}]}`              |
| POST   | `/api/households`                               | `{name}` (1–80 characters) | 201 `{household}` and Location                |
| POST   | `/api/households/:id/selection`                 | `{}`                       | session view                                  |
| GET    | `/api/households/:id/members`                   | —                          | `{members: [{id,name,email,role}]}`           |
| POST   | `/api/households/:id/invitations`               | `{email}`                  | 201 `{invitation:{id,email,expiresAt},token}` |
| DELETE | `/api/households/:id/invitations/:invitationId` | —                          | 204                                           |
| POST   | `/api/household-memberships`                    | `{token}`                  | 201 `{household}`                             |
| DELETE | `/api/households/:id/members/:userId`           | —                          | 204                                           |

Creating/joining selects that household in the session. A user may belong to 20
households; each supports up to 100 members and 50 outstanding invitations.
Only an owner may invite/revoke/remove others. A member may leave themselves;
the final owner cannot leave or be removed (409). Roles are fixed by the server:
creators are owners, invitees members. No request may choose its own role.

Invitation codes have 256 bits of randomness, expire after seven days and may be
redeemed once by a signed-in account with the invited email. Only SHA-256 hashes
are stored. Creating a new invitation for an address invalidates the prior one.
The caller must share the displayed code directly with the intended recipient;
the application does not send email. Possession of the code and matching account
email are required; there is no general email-address verification service.
Invalid, expired, wrong-address and consumed codes share the same 400 response.
Times use Unix milliseconds. Membership removal clears selected sessions and
immediately prevents subsequent data access.

## Household data scope

`GET /api/state`, `POST /api/sync` and `POST /api/import` require an explicit
`X-Household-Id` header. A missing scope returns 409 `selection_required`.
The session selection is a UI preference, not an implicit data scope. This is
essential when separate tabs use different households: an old offline outbox
must never be sent into the newly selected household. Store local caches and
outboxes separately by user ID and household ID. A valid header still requires
current household membership. Data rows and operation replay IDs are scoped
together; the same IDs in separate households cannot read/overwrite each other.

## Existing installations

The legacy `rows` and `operations` tables are preserved without modification.
They are no longer reachable from HTTP. Newly created households start empty;
old data is never automatically assigned to the first person who registers.
This deliberate isolation prevents an arbitrary registrant from claiming an
existing installation's private recipes and shopping history. No web claim or
migration endpoint is provided. An administrator must verify ownership and carry
out any migration explicitly while the server is stopped, with a backup first.
