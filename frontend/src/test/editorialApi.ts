import type {
  ArchiveDocument,
  Draft,
  EditorialTopic,
  Evidence,
  InvestigationDetail,
  LanguageStatus,
  Review,
  Source,
  Submission,
  VersionDetail,
  WorkflowStatus,
} from "../api/editorial/types";
import type { StaffRole } from "../api/types";
import { CSRF } from "./fixtures";
import { installFetch, type RouteResult } from "./fetch";
import { makeSnapshot } from "./fixtures";

export const ID = {
  editor: "11111111-1111-4111-8111-111111111111",
  researcher: "22222222-2222-4222-8222-222222222222",
  approver: "33333333-3333-4333-8333-333333333333",
  admin: "44444444-4444-4444-8444-444444444444",
  submission: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  duplicate: "aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb",
  claim: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  investigation: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  source: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  source2: "eeeeeeee-eeee-4eee-8eee-ffffffffffff",
  evidence: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  factCheck: "99999999-9999-4999-8999-999999999999",
  content: "88888888-8888-4888-8888-888888888888",
  document: "77777777-7777-4777-8777-777777777777",
  topic: "66666666-6666-4666-8666-666666666666",
} as const;

const NOW = "2026-03-01T10:00:00Z";

export interface StaffFixture {
  id: string;
  email: string;
  display_name: string;
  roles: StaffRole[];
  is_active: boolean;
}

export const STAFF: Record<"editor" | "researcher" | "approver" | "admin", StaffFixture> = {
  editor: {
    id: ID.editor,
    email: "editor@example.org",
    display_name: "Tenzin Editor",
    roles: ["editor"],
    is_active: true,
  },
  researcher: {
    id: ID.researcher,
    email: "researcher@example.org",
    display_name: "Pema Researcher",
    roles: ["researcher"],
    is_active: true,
  },
  approver: {
    id: ID.approver,
    email: "approver@example.org",
    display_name: "Dolma Approver",
    roles: ["approver"],
    is_active: true,
  },
  admin: {
    id: ID.admin,
    email: "admin@example.org",
    display_name: "Admin",
    roles: ["platform_administrator"],
    is_active: true,
  },
};

export interface Call {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
  headers: Headers;
}

export interface EditorialState {
  submission: Submission;
  claimId: string | null;
  investigation: InvestigationDetail;
  documents: ArchiveDocument[];
  languageStatus: Record<"bo" | "en", LanguageStatus>;
  revision: number;
  draft: Draft;
  reviews: Review[];
  versions: VersionDetail[];
  topics: EditorialTopic[];
  slug: string | null;
  contactReveals: number;
  signedOut: boolean;
  /** Set to make the next draft PATCH answer 409 as if someone else saved first. */
  remoteDraftEdit: Partial<Draft> | null;
}

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: ID.submission,
    claim_text: "The river stops flowing every winter.",
    context_text: "Seen in a group chat.",
    source_url: "https://example.org/post/1",
    channel: "public_form",
    workflow_status: "inbox",
    claim_id: null,
    assigned_to_id: null,
    duplicate_of_id: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: ID.source,
    investigation_id: ID.investigation,
    title: "River gauge report",
    url: "https://example.org/gauge",
    publisher: "Hydrology Office",
    author: null,
    published_at: null,
    retrieved_at: null,
    source_language: "en",
    reliability_notes: "Official station data.",
    position: 0,
    ...overrides,
  };
}

export function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: ID.evidence,
    investigation_id: ID.investigation,
    excerpt: "Flow was recorded in every month.",
    notes: "Station 4 only.",
    stance: "contradicts",
    source_id: ID.source,
    archive_document_id: null,
    position: 0,
    verified_at: null,
    verified_by_id: null,
    ...overrides,
  };
}

function investigationDetail(status: WorkflowStatus, withData: boolean): InvestigationDetail {
  return {
    investigation: {
      id: ID.investigation,
      claim_id: ID.claim,
      owner_id: ID.researcher,
      workflow_status: status,
      created_at: NOW,
      updated_at: NOW,
    },
    fact_check_id: null,
    claim: {
      id: ID.claim,
      canonical_text: "The river stops flowing every winter.",
      context_summary: null,
      created_at: NOW,
      updated_at: NOW,
    },
    internal_notes: "Check station 4.",
    hold_reason: null,
    reject_reason: null,
    assignments: [
      {
        user_id: ID.researcher,
        assignment_role: "owner",
        assigned_by_id: ID.editor,
        assigned_at: NOW,
        removed_at: null,
      },
    ],
    sources: withData ? [makeSource()] : [],
    evidence_items: withData ? [makeEvidence()] : [],
  };
}

function draftFor(language: "bo" | "en", status: LanguageStatus, revision: number): Draft {
  return {
    fact_check_id: ID.factCheck,
    language,
    editorial_status: status,
    translation_status: language === "en" ? "pending" : "pending",
    current_revision_number: revision,
    title: language === "en" ? "Does the river run dry every winter?" : "ཆུ་མཐོ་འཐུང་།",
    summary: "A viral post says so.",
    claim_text: "The river stops flowing every winter.",
    context_text: "The post circulated in December.",
    verdict: "false",
    verdict_explanation: "Gauge records show continuous flow.",
    analysis_markdown: "Gauge data shows **flow** in every month.",
    limitations_markdown: "One station only.",
    sources: [{ source_id: ID.source, relevance_note: "Primary data", position: 0 }],
  };
}

export interface EditorialOptions {
  /** Who is signed in. */
  user?: StaffFixture;
  /** Starting point of the fact-check: the language status of English. */
  languageStatus?: LanguageStatus;
  investigationStatus?: WorkflowStatus;
  /** Whether the investigation already has a source and evidence. */
  withEvidence?: boolean;
  /** Answer before the built-in routes. Return null to fall through. */
  override?: (call: Call, state: EditorialState) => RouteResult | null;
}

function notFound(): RouteResult {
  return { status: 404, body: { detail: "Not Found" } };
}

function forbidden(): RouteResult {
  return { status: 403, body: { detail: "Forbidden" } };
}

/**
 * An in-memory stand-in for the staff API with enough state to walk the editorial workflow.
 * It never decides policy: the real API does that, and its role tests live in the backend. Here
 * the interesting question is what the screens show for each answer, so `override` can make any
 * endpoint answer 403 or 404.
 */
export function installEditorialApi(options: EditorialOptions = {}) {
  const user = options.user ?? STAFF.editor;
  const initialStatus = options.languageStatus ?? "draft";
  const state: EditorialState = {
    submission: submission(),
    claimId: null,
    investigation: investigationDetail(
      options.investigationStatus ?? "researching",
      options.withEvidence ?? true,
    ),
    documents: [
      {
        id: ID.document,
        title: "Gauge spreadsheet",
        description: null,
        visibility: "internal",
        mime_type: "text/csv",
        byte_size: 2048,
        investigation_id: ID.investigation,
        original_filename: "gauge.csv",
        sha256: "ab".repeat(32),
        upload_status: "available",
        classified_by_id: null,
        created_at: NOW,
        updated_at: NOW,
      },
    ],
    languageStatus: { en: initialStatus, bo: "draft" },
    revision: 3,
    draft: draftFor("en", initialStatus, 3),
    reviews: [],
    versions: [],
    topics: [
      {
        id: ID.topic,
        slug: "environment",
        name_bo: "ཁོར་ཡུག",
        name_en: "Environment",
        description_bo: null,
        description_en: null,
        position: 0,
        is_active: true,
        slug_immutable: false,
      },
    ],
    slug: "river-claim",
    contactReveals: 0,
    signedOut: false,
    remoteDraftEdit: null,
  };
  const rollup = (status: LanguageStatus): WorkflowStatus =>
    status === "draft" || status === "withdrawn"
      ? "drafting"
      : status === "ready_for_approval"
        ? "in_review"
        : status;
  if (options.languageStatus !== undefined && options.investigationStatus === undefined) {
    state.investigation.investigation.workflow_status = rollup(initialStatus);
  }
  const hasFactCheck = options.languageStatus !== undefined;
  if (hasFactCheck) {
    state.investigation.fact_check_id = ID.factCheck;
  }

  const calls: Call[] = [];

  const setStatus = (status: LanguageStatus) => {
    state.languageStatus.en = status;
    state.draft = { ...state.draft, editorial_status: status };
    state.investigation.investigation.workflow_status = rollup(status);
  };
  const bump = () => {
    state.revision += 1;
    state.draft = { ...state.draft, current_revision_number: state.revision };
  };

  const factCheckDetail = () => ({
    fact_check: {
      id: ID.factCheck,
      investigation_id: ID.investigation,
      workflow_status: (state.languageStatus.en === "published"
        ? "published"
        : "drafting") as WorkflowStatus,
      public_slug: state.slug,
      published_at: state.versions.length > 0 ? NOW : null,
      created_at: NOW,
      updated_at: NOW,
    },
    languages: (["bo", "en"] as const).map((language) => ({
      content_id: language === "en" ? ID.content : "87878787-8787-4787-8787-878787878787",
      language,
      editorial_status: state.languageStatus[language],
      translation_status: "pending",
      current_revision_number: language === "en" ? state.revision : 1,
      live_version_number:
        language === "en" && state.versions.length > 0 ? state.versions.length : null,
      published_at: language === "en" && state.versions.length > 0 ? NOW : null,
      readiness_issues: [],
    })),
  });

  const queueItems = () =>
    state.languageStatus.en === "ready_for_approval" || state.languageStatus.en === "approved"
      ? [
          {
            fact_check_id: ID.factCheck,
            language: "en",
            title: state.draft.title,
            public_slug: state.slug,
            current_revision_number: state.revision,
            updated_at: NOW,
          },
        ]
      : [];

  const snapshotFor = () =>
    makeSnapshot({
      public_slug: state.slug ?? "river-claim",
      title: state.draft.title ?? "",
      kind: state.versions.length === 0 ? "initial" : "correction",
    });

  function route(call: Call): RouteResult {
    const { method, path, search, body } = call;
    const payload = (body ?? {}) as Record<string, unknown>;
    let match: RegExpExecArray | null;

    if (path === "/ready") return { status: 200, body: { status: "ready" } };
    if (path === "/api/v1/me") {
      return state.signedOut
        ? { status: 401, body: { detail: "Authentication required" } }
        : { status: 200, body: user };
    }
    if (path === "/api/v1/auth/logout" && method === "POST") {
      state.signedOut = true;
      return { status: 204 };
    }
    if (path === "/api/v1/auth/csrf") return { status: 200, body: { csrf_token: CSRF } };
    if (path === "/api/v1/editorial/status") {
      return { status: 200, body: { status: "ok", roles: user.roles } };
    }
    if (path === "/api/v1/editorial/staff") {
      return {
        status: 200,
        body: {
          items: [STAFF.editor, STAFF.researcher, STAFF.approver].map(
            ({ id, email, display_name, roles }) => ({ id, email, display_name, roles }),
          ),
        },
      };
    }
    if (path === "/api/v1/admin/users") {
      return {
        status: 200,
        body: {
          items: Object.values(STAFF).map((member) => ({ ...member, disabled_at: null })),
        },
      };
    }

    /* Intake */
    if (path === "/api/v1/editorial/submissions" && method === "GET") {
      const wanted = search.get("workflow_status");
      const items =
        wanted === null || wanted === state.submission.workflow_status ? [state.submission] : [];
      return { status: 200, body: { items, next_cursor: null } };
    }
    if ((match = /^\/api\/v1\/editorial\/submissions\/([^/]+)$/.exec(path)) && method === "GET") {
      if (match[1] !== ID.submission) return notFound();
      return {
        status: 200,
        body: {
          submission: state.submission,
          claim:
            state.claimId === null
              ? null
              : {
                  id: state.claimId,
                  canonical_text: "The river stops flowing every winter.",
                  context_summary: null,
                  created_at: NOW,
                  updated_at: NOW,
                },
          duplicate_suggestions: [
            {
              id: ID.duplicate,
              claim_text: "Is the river dry in winter?",
              workflow_status: "triaged",
              similarity: 0.82,
              exact_match: false,
            },
          ],
        },
      };
    }
    if (/^\/api\/v1\/editorial\/submissions\/[^/]+\/contact$/.test(path)) {
      state.contactReveals += 1;
      return {
        status: 200,
        body: {
          contact_name: "Sonam",
          contact_email: "sonam@example.org",
          contact_phone: null,
          privacy_notice_acknowledged: true,
        },
      };
    }
    if (/^\/api\/v1\/editorial\/submissions\/[^/]+\/triage$/.test(path) && method === "POST") {
      const action = payload.action;
      if (action === "reject") state.submission.workflow_status = "rejected";
      if (action === "hold") state.submission.workflow_status = "on_hold";
      if (action === "create_claim" || action === "link_to_claim") {
        state.claimId = ID.claim;
        state.submission = { ...state.submission, claim_id: ID.claim, workflow_status: "triaged" };
      }
      if (action === "open_investigation") {
        state.submission.workflow_status = "triaged";
      }
      return {
        status: 200,
        body: { submission: state.submission, claim: null, duplicate_suggestions: [] },
      };
    }
    if (path === "/api/v1/editorial/claims") {
      return {
        status: 200,
        body: {
          items: [
            {
              id: ID.claim,
              canonical_text: "The river stops flowing every winter.",
              context_summary: null,
              created_at: NOW,
              updated_at: NOW,
            },
          ],
          next_cursor: null,
        },
      };
    }

    /* Investigations */
    if (path === "/api/v1/investigations" && method === "GET") {
      return {
        status: 200,
        body: {
          items: [
            {
              ...state.investigation.investigation,
              claim_text: state.investigation.claim.canonical_text,
            },
          ],
          next_cursor: null,
        },
      };
    }
    if (path === "/api/v1/investigations" && method === "POST") {
      return { status: 201, body: state.investigation };
    }
    if ((match = /^\/api\/v1\/investigations\/([^/]+)(\/.*)?$/.exec(path))) {
      if (match[1] !== ID.investigation) return notFound();
      const rest = match[2] ?? "";
      const inv = state.investigation;
      if (rest === "" && method === "GET") return { status: 200, body: inv };
      if (rest === "" && method === "PATCH") {
        inv.internal_notes = (payload.internal_notes as string | null) ?? null;
        return { status: 200, body: inv };
      }
      if (rest === "/status") {
        const next = payload.status as WorkflowStatus;
        inv.investigation.workflow_status = next;
        inv.hold_reason = next === "on_hold" ? (payload.reason as string) : null;
        inv.reject_reason = next === "rejected" ? (payload.reason as string) : null;
        return { status: 200, body: inv };
      }
      if (rest === "/assignments" && method === "POST") {
        inv.assignments.push({
          user_id: payload.user_id as string,
          assignment_role: "contributor",
          assigned_by_id: user.id,
          assigned_at: NOW,
          removed_at: null,
        });
        return { status: 200, body: inv };
      }
      if ((match = /^\/assignments\/([^/]+)$/.exec(rest)) && method === "DELETE") {
        inv.assignments = inv.assignments.filter((entry) => entry.user_id !== match?.[1]);
        return { status: 200, body: inv };
      }
      if (rest === "/sources" && method === "POST") {
        const created = makeSource({
          id: ID.source2,
          title: payload.title as string,
          url: (payload.url as string | null) ?? null,
          reliability_notes: (payload.reliability_notes as string | null) ?? null,
          position: inv.sources.length,
        });
        inv.sources.push(created);
        return { status: 201, body: created };
      }
      if (rest === "/sources/reorder") {
        const order = payload.ordered_ids as string[];
        inv.sources.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        return { status: 200, body: inv };
      }
      if ((match = /^\/sources\/([^/]+)$/.exec(rest))) {
        const found = inv.sources.find((entry) => entry.id === match?.[1]);
        if (!found) return notFound();
        if (method === "DELETE") {
          inv.sources = inv.sources.filter((entry) => entry !== found);
          return { status: 200, body: inv };
        }
        Object.assign(found, payload);
        return { status: 200, body: found };
      }
      if (rest === "/evidence" && method === "POST") {
        const created = makeEvidence({
          id: "abababab-abab-4bab-8bab-abababababab",
          excerpt: (payload.excerpt as string | null) ?? null,
          stance: (payload.stance as Evidence["stance"]) ?? null,
        });
        inv.evidence_items.push(created);
        return { status: 201, body: created };
      }
      if (rest === "/evidence/reorder") return { status: 200, body: inv };
      if ((match = /^\/evidence\/([^/]+)\/verify$/.exec(rest))) {
        const found = inv.evidence_items.find((entry) => entry.id === match?.[1]);
        if (!found) return notFound();
        found.verified_at = NOW;
        found.verified_by_id = user.id;
        return { status: 200, body: found };
      }
      if ((match = /^\/evidence\/([^/]+)$/.exec(rest))) {
        const found = inv.evidence_items.find((entry) => entry.id === match?.[1]);
        if (!found) return notFound();
        if (method === "DELETE") {
          inv.evidence_items = inv.evidence_items.filter((entry) => entry !== found);
          return { status: 200, body: inv };
        }
        Object.assign(found, payload);
        return { status: 200, body: found };
      }
      if (rest === "/documents" && method === "POST") {
        const created = { ...state.documents[0], id: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd" };
        state.documents.push(created as ArchiveDocument);
        return { status: 201, body: created };
      }
      if (rest === "/factcheck" && method === "POST") {
        inv.fact_check_id = ID.factCheck;
        inv.investigation.workflow_status = "drafting";
        return {
          status: 201,
          body: {
            id: ID.factCheck,
            investigation_id: ID.investigation,
            workflow_status: "drafting",
            public_slug: null,
            languages: payload.languages,
          },
        };
      }
    }

    /* Archive */
    if (path === "/api/v1/archive/documents") {
      return { status: 200, body: { items: state.documents, next_cursor: null } };
    }
    if ((match = /^\/api\/v1\/archive\/documents\/([^/]+)(\/.*)?$/.exec(path))) {
      const document = state.documents.find((entry) => entry.id === match?.[1]);
      if (!document) return notFound();
      const rest = match[2] ?? "";
      if (rest === "") return { status: 200, body: document };
      if (rest === "/access-link") {
        return {
          status: 200,
          body: {
            url: "https://files.example.org/signed?sig=abc",
            expires_at: "2026-03-01T10:05:00Z",
          },
        };
      }
      if (rest === "/classification") {
        document.visibility = payload.visibility as ArchiveDocument["visibility"];
        return { status: 200, body: document };
      }
      if (rest === "/grants") {
        return method === "GET"
          ? { status: 200, body: { items: [] } }
          : { status: 201, body: { id: "g1", user_id: payload.user_id } };
      }
    }

    /* Fact-checks */
    if (path === "/api/v1/editorial/factchecks" && method === "GET") {
      if (!hasFactCheck && !state.investigation.fact_check_id) {
        return { status: 200, body: { items: [], next_cursor: null } };
      }
      return {
        status: 200,
        body: {
          items: [
            {
              ...factCheckDetail().fact_check,
              languages: (["bo", "en"] as const).map((language) => ({
                language,
                editorial_status: state.languageStatus[language],
                title: language === "en" ? state.draft.title : null,
              })),
            },
          ],
          next_cursor: null,
        },
      };
    }
    if (path === "/api/v1/editorial/approval-queue") {
      return { status: 200, body: { items: queueItems(), next_cursor: null } };
    }
    if (path === "/api/v1/editorial/topics" && method === "GET") {
      return { status: 200, body: { items: state.topics } };
    }
    if ((match = /^\/api\/v1\/editorial\/factchecks\/([^/]+)(\/.*)?$/.exec(path))) {
      if (match[1] !== ID.factCheck) return notFound();
      const rest = match[2] ?? "";
      if (rest === "" && method === "GET") return { status: 200, body: factCheckDetail() };
      if (rest === "" && method === "PATCH") {
        state.slug = payload.public_slug as string;
        return { status: 200, body: factCheckDetail() };
      }
      if (rest === "/topics") {
        return method === "GET"
          ? { status: 200, body: { items: state.topics } }
          : { status: 200, body: { items: state.topics } };
      }
      if ((match = /^\/languages\/(bo|en)(\/.*)?$/.exec(rest))) {
        const language = match[1] as "bo" | "en";
        const action = match[2] ?? "";
        const draft = language === "en" ? state.draft : draftFor("bo", state.languageStatus.bo, 1);
        if (action === "" && method === "GET") return { status: 200, body: draft };
        if (language !== "en") return notFound();
        if (action === "" && method === "PATCH") {
          if (state.remoteDraftEdit) {
            state.draft = { ...state.draft, ...state.remoteDraftEdit };
            state.remoteDraftEdit = null;
            bump();
          }
          if (payload.expected_revision !== state.revision) {
            return {
              status: 409,
              body: {
                detail: {
                  code: "stale_revision",
                  message: "Draft was changed",
                  current_revision_number: state.revision,
                },
              },
            };
          }
          const { expected_revision: _expected, ...fields } = payload;
          void _expected;
          state.draft = { ...state.draft, ...(fields as Partial<Draft>) };
          bump();
          return { status: 200, body: state.draft };
        }
        if (action === "/sources") {
          state.draft = {
            ...state.draft,
            sources: (payload.items as Draft["sources"]) ?? [],
          };
          bump();
          return { status: 200, body: state.draft };
        }
        if (action === "/preview") {
          return {
            status: 200,
            body: {
              analysis_html: "<p>Rendered <strong>analysis</strong></p>",
              limitations_html: "<p>Rendered limits</p>",
            },
          };
        }
        if (action === "/readiness") return { status: 200, body: { issues: [] } };
        if (action === "/reviews" && method === "GET") {
          return { status: 200, body: { items: state.reviews } };
        }
        if (action === "/reviews" && method === "POST") {
          const review: Review = {
            id: `rev-${state.reviews.length + 1}`,
            fact_check_content_id: ID.content,
            reviewer_id: user.id,
            decision: "comment",
            comments: payload.comments as string,
            revision_id: null,
            created_at: NOW,
            invalidated_at: null,
          };
          state.reviews.push(review);
          return { status: 200, body: review };
        }
        if (action === "/submit-for-review") {
          setStatus("in_review");
          return { status: 200, body: { editorial_status: "in_review", readiness_warnings: [] } };
        }
        if (action === "/mark-ready") {
          setStatus("ready_for_approval");
          return { status: 200, body: state.draft };
        }
        if (action === "/request-changes") {
          setStatus("changes_requested");
          return { status: 200, body: state.draft };
        }
        if (action === "/reopen") {
          setStatus("draft");
          return { status: 200, body: state.draft };
        }
        if (action === "/approve") {
          if (payload.expected_revision !== state.revision) {
            return {
              status: 409,
              body: { detail: { code: "stale_revision", message: "Revision changed" } },
            };
          }
          setStatus("approved");
          return { status: 200, body: state.draft };
        }
        if (action === "/publish-preview") {
          return {
            status: 200,
            body: {
              snapshot: snapshotFor(),
              kind: state.versions.length === 0 ? "initial" : "correction",
              revision_number: state.revision,
              correction_note_required: state.versions.length > 0,
              readiness_issues: [],
            },
          };
        }
        if (action === "/publish") {
          if (state.versions.length > 0 && !payload.correction_note) {
            return {
              status: 409,
              body: { detail: { code: "correction_note_required", message: "Note required" } },
            };
          }
          state.versions.push({
            version_number: state.versions.length + 1,
            kind: state.versions.length === 0 ? "initial" : "correction",
            published_at: NOW,
            content_checksum: "c".repeat(64),
            checksum_valid: true,
            snapshot: snapshotFor(),
          });
          setStatus("published");
          return {
            status: 200,
            body: { editorial_status: "published", version_number: state.versions.length },
          };
        }
        if (action === "/corrections") {
          setStatus("draft");
          bump();
          return { status: 200, body: state.draft };
        }
        if (action === "/withdraw") {
          setStatus("withdrawn");
          return { status: 200, body: state.draft };
        }
        if (action === "/versions") {
          return {
            status: 200,
            body: {
              items: state.versions.map(({ snapshot: _snapshot, ...row }) => {
                void _snapshot;
                return row;
              }),
            },
          };
        }
        if ((match = /^\/versions\/(\d+)$/.exec(action))) {
          const found = state.versions.find((entry) => entry.version_number === Number(match?.[1]));
          return found ? { status: 200, body: found } : notFound();
        }
      }
    }
    if (path === "/api/v1/editorial/audit") {
      return {
        status: 200,
        body: {
          items: [
            {
              id: "ev1",
              event_type: "draft.submitted_for_review",
              actor_user_id: ID.researcher,
              subject_type: "fact_check_content",
              subject_id: ID.content,
              payload: { language: "en" },
              created_at: NOW,
            },
          ],
          next_cursor: null,
        },
      };
    }
    throw new Error(`Unhandled ${method} ${path}`);
  }

  const fetchMock = installFetch((rawUrl, init) => {
    const url = new URL(rawUrl);
    let body: unknown;
    if (typeof init.body === "string") {
      body = JSON.parse(init.body);
    } else if (init.body instanceof FormData) {
      body = init.body;
    }
    const call: Call = {
      method: (init.method ?? "GET").toUpperCase(),
      path: url.pathname,
      search: url.searchParams,
      body,
      headers: new Headers(init.headers),
    };
    calls.push(call);
    const overridden = options.override?.(call, state);
    return overridden ?? route(call);
  });

  return {
    fetchMock,
    calls,
    state,
    /** Calls that changed something, in order. */
    writes: () => calls.filter((call) => call.method !== "GET"),
    callsTo: (method: string, pattern: RegExp) =>
      calls.filter((call) => call.method === method && pattern.test(call.path)),
  };
}

export { forbidden, notFound };
