# Access policy reference (Phase 2)

Authorization is centralized in `backend/app/core/policy.py`. Routes load objects through policy-aware dependencies in `backend/app/api/deps/access.py`. Denied access returns **404** (not 403) so resource IDs cannot be enumerated.

## Roles

| Role | Submissions inbox | Contact data | Investigations | Archive `INTERNAL` | Archive `RESTRICTED` |
| --- | --- | --- | --- | --- | --- |
| Researcher | List/triage (no contact) | Denied | Assigned only; read/write workspace | Assigned investigation; upload/view | Requires `AccessGrant` |
| Editor | Full inbox | View (audited) | All investigations | All investigations; upload/view | Requires grant; may grant if editor holds grant |
| Approver | Denied | Denied | Assigned only; **read-only** | Assigned; view metadata/download | Requires grant |
| Platform admin (no editorial role) | Denied | Denied | Denied | Denied | Denied |

New uploads are always stored as **`INTERNAL`**. Editors may reclassify documents; moving to **`RESTRICTED`** grants the acting editor access automatically.

## Archive download flow

1. Policy checks `ARCHIVE_DOWNLOAD` on the document (membership + grant for restricted).
2. `POST /api/v1/archive/documents/{id}/access-link` returns a short-lived presigned URL.
3. Restricted access links append an audit event (actor and request ID; never the URL).

## Public vs staff surfaces

- `POST /api/v1/submissions` is public; responses never echo stored editorial data or contact fields.
- Archive metadata responses never include storage keys.
- No Phase 2 route exposes `PUBLIC_*` archive content on the public site (Phase 4 decision).

See also [launch-decisions.md](launch-decisions.md) for operational policies still open before launch.
