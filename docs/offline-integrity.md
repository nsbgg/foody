# Offline storage and conflict integrity

The client stores acknowledged rows, immutable pending operations and conflict choices in IndexedDB. Each change uses an atomic read/reduce/write transaction; tabs notify each other through BroadcastChannel and refresh on focus, visibility changes and reconnect. A generation counter prevents a late read from replacing newer local state.

Only the oldest operation for each entity is sent. A conflicting ancestor freezes its descendants until the user resolves the conflict. Responses acknowledge exact operation IDs and cannot rebase another tab's pending edit. Older responses cannot replace a newer server revision. An editor keeps the revision it originally opened, so saving an old draft produces a conflict instead of overwriting a refreshed row.

Choosing a conflict resolution creates a fresh operation against the reviewed remote revision. If another remote revision arrived after the conflict was displayed, the comparison updates and requires another explicit choice. Unrelated entities continue synchronizing.

Failed IndexedDB writes are reported in the open editor, which retains the draft. The write queue recovers for subsequent saves. Temporary optimistic changes keep controlled inputs responsive, then reconcile with durable storage. Cooking progress remains device-local.

## Reproducible checks

- `tests/sync-model.test.ts`: interleaved tab edits, dependent operation ordering, immutable revisions, late responses, old-state migration and stale conflict choices.
- `tests/e2e/storage.spec.ts`: two offline tabs retain their edits after both close; a simulated quota error preserves the draft and a retry succeeds; a stale open editor conflicts with a newer backend revision.
- Existing browser checks cover planning, recipe snapshots, shopping, cooking, URL import, conflict resolution, offline reload and mobile/tablet layouts.

## Scope and limitations

Offline support requires an initial successful load. Browser storage can be cleared or evicted; it is not a server backup. Sync runs while the application is open and connected. Imported websites may omit structured recipe data or refuse access. The household has no authentication and should run on a trusted network; see [network boundary](./network-boundary.md).

The backend sends restrictive referrer and permissions policies and does not log request payloads or raw unexpected error objects. Camera, microphone, location and payment features are disabled; screen wake lock remains available for cooking.
