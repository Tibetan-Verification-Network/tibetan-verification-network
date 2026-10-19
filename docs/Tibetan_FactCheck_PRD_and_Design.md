# Tibetan FactCheck — Product Requirements & Design Document

**Document type:** Product Requirements Document (PRD) + Product/Technical Design  
**Status:** MVP planning draft  
**Product:** Tibetan FactCheck  
**Primary languages:** Tibetan and English  
**Audience:** People interested in Tibet, including Tibetan communities, researchers, journalists, students, and the wider public  
**Backend recommendation:** FastAPI + PostgreSQL

---

## 1. Executive summary

Tibetan FactCheck is an independent, nonpartisan, bilingual fact-checking platform focused on claims, rumors, viral media, public narratives, and disputed information related to Tibet. It will combine public submissions, curated monitoring of public sources, and a reference archive to help readers understand what is known, what is disputed, and what remains uncertain.

The platform will use AI to assist with research, source discovery, evidence organization, and draft preparation. **AI must never publish a fact-check or independently make the final editorial decision.** Every published fact-check requires documented human review and approval.

The MVP should prioritize trustworthy editorial workflow, clear evidence provenance, secure handling of private research, and a useful public fact-check library over broad automation or complex features.

## 2. Product vision

Make reliable, transparent, accessible fact-checking about Tibet easier to find, understand, submit to, and review—without assuming a political position or treating any single source as automatically authoritative.

### Product principles

1. **Evidence before conclusion:** conclusions must be traceable to sources.
2. **Editorial independence:** verdicts are based on the evidence and a published methodology.
3. **Human accountability:** a human reviewer and authorized approver are responsible for publication.
4. **Transparency:** readers can see the claim, verdict, reasoning, sources, and correction history.
5. **Bilingual access:** Tibetan and English content are first-class product requirements.
6. **Privacy by default:** private notes, submitter details, and restricted archive documents are not public.
7. **Proportionate scope:** start with a small, dependable MVP and expand after it works.

## 3. Goals and non-goals

### Goals

- Publish searchable, well-sourced fact-checks in Tibetan and English.
- Accept claim submissions from the public.
- Provide a private editorial dashboard for intake, research, drafting, review, approval, and publication.
- Keep a traceable record of sources, evidence, AI-assisted research, reviewer decisions, and published versions.
- Support a mixed archive containing public metadata, public documents, internal notes, and restricted materials.
- Use AI to reduce repetitive research and drafting work while retaining human editorial control.
- Keep initial hosting and service costs low, with a target of roughly **US$10–30/month where feasible**, excluding variable AI usage and any paid services required by actual usage.

### Non-goals for the first release

- Fully autonomous fact-checking or automatic publication.
- Comprehensive real-time monitoring of every website or social network.
- A public discussion forum, comments system, or social network.
- A complex analytics suite or public user accounts.
- A custom AI model trained from scratch.
- Automatic public release of the full research archive.
- Guaranteed anonymity unless the implementation and operational policy can actually support it.

## 4. Target users and roles

### Public users

- **Reader:** searches and reads published fact-checks.
- **Submitter:** sends a claim or item for review. A submitter may optionally provide contact details, subject to a clear privacy notice.

### Internal users

- **Researcher:** triages claims, opens investigations, gathers sources, records evidence, and prepares drafts.
- **Editor:** edits drafts, checks evidence and language, and requests changes.
- **Approver:** independently approves a fact-check for publication.
- **Platform administrator:** manages accounts and system configuration. Administrative access does not automatically grant editorial approval or access to restricted research material.

A small team may assign more than one role to a person, but **no author may approve their own work**. Publication should require an approval recorded by another authorized person.

## 5. MVP scope

### P0 — Required for launch

1. Public fact-check library with search and basic filters.
2. Public fact-check detail pages.
3. Tibetan/English language support and linked translations.
4. Public claim submission form.
5. Authenticated editorial dashboard.
6. Submission triage and duplicate-claim handling.
7. Investigation workspace with sources and evidence items.
8. Drafting, review, request-changes, approval, and publication workflow.
9. Role-based and object-level access control enforced by the backend.
10. Private-by-default archive documents with explicit visibility levels.
11. Audit events for sensitive actions, approval, publication, and corrections.
12. Immutable published article versions or equivalent version snapshots.
13. Automated tests for permissions and critical workflow rules.

### P1 — After the core MVP is stable

- Curated RSS/public-source monitoring.
- AI-assisted source summarization and draft generation.
- AI-supported counter-evidence discovery.
- More advanced search filters and tags.
- Archive metadata search.
- Editorial workload and usage reporting.
- Better duplicate detection.

### P2 — Later possibilities

- More sophisticated monitoring and source alerts.
- Public correction suggestions or structured feedback.
- Additional languages.
- Public API for approved content.
- More advanced full-text search, analytics, and archive discovery.

## 6. Key user journeys

### 6.1 Reader finds a fact-check

1. Reader opens the site.
2. Reader searches by keyword or filters by topic, verdict, or language.
3. Reader opens an article.
4. Article presents the original claim, verdict, explanation, sources, publication date, and correction/version information.
5. Reader can switch to the linked translation if it exists.

**Success condition:** readers can identify the conclusion and inspect the supporting evidence without seeing private editorial notes.

### 6.2 Public user submits a claim

1. Submitter enters the claim and where they encountered it.
2. Submitter may provide a source URL and optional contact details.
3. The form explains that submission does not guarantee investigation or publication.
4. Backend validates, rate-limits, and stores the submission.
5. Submission appears in the private editorial inbox.
6. Editorial staff triage it and either reject, hold, merge with an existing claim, or create an investigation.

**Success condition:** the submission is safely stored and visible only to authorized staff.

### 6.3 Researcher investigates a claim

1. Researcher opens or creates an investigation.
2. Researcher records the original wording and context.
3. Researcher adds sources and evidence excerpts, with source dates and retrieval timestamps.
4. AI tools may summarize sources, suggest additional searches, or identify potential counter-evidence.
5. Researcher verifies all important source claims and prepares a draft.
6. The draft is sent for review.

**Success condition:** the evidence trail is understandable and does not rely solely on AI-generated statements.

### 6.4 Editor and approver publish a fact-check

1. Editor reviews reasoning, source quality, quotations, context, counter-evidence, and language.
2. Editor requests changes or marks the work ready for independent approval.
3. A different authorized person records approval.
4. Backend checks required fields and workflow constraints.
5. Publication creates a version snapshot and audit event.
6. Only explicitly public fields and documents are exposed.

**Success condition:** the author cannot self-approve; the publication record is traceable and reversible through a correction/new-version process.

## 7. Editorial workflow and verdict taxonomy

Workflow status and verdict must be stored separately.

### Workflow statuses

| Status | Meaning |
|---|---|
| `INBOX` | Newly submitted; waiting for triage |
| `TRIAGED` | Reviewed for scope and queued or assigned |
| `RESEARCHING` | Evidence collection in progress |
| `DRAFTING` | Analysis is being written |
| `IN_REVIEW` | Awaiting editorial review |
| `CHANGES_REQUESTED` | Returned for revision |
| `APPROVED` | Independent approval recorded |
| `PUBLISHED` | Public article is live |
| `REJECTED` | Not proceeding, with a recorded reason |
| `ON_HOLD` | Paused, with a recorded reason |

### Proposed public verdicts

- **True**
- **False**
- **Misleading**
- **Unverified**
- **Unclear**

The editorial team must define precise criteria and examples for each label before launch. The UI should include a short explanation of the verdict and avoid relying on color alone to communicate meaning.

## 8. Functional requirements

### FR-1: Public library and search

- Visitors can browse published fact-checks.
- Search results include title, summary, verdict, language, topic tags, and publication date.
- Search and detail endpoints return published content only.
- Unpublished drafts and internal notes must not be discoverable through search, filters, or guessed IDs.

### FR-2: Fact-check detail page

Each public article should support:

- Original claim and relevant context.
- Verdict and short explanation.
- Detailed analysis.
- Source list with publisher, title, URL, date where available, and description of relevance.
- Publication date and last-updated date.
- Author/editorial attribution according to policy.
- Correction/version history.
- Linked Tibetan and English versions, with translation status where appropriate.

### FR-3: Claim submissions

- A public form accepts claim text and optional source URL/context.
- Contact information is optional unless the team has a documented reason to require it.
- The form displays a privacy notice and explains the review process.
- Backend validation, rate limits, abuse controls, and safe URL handling are required.
- Submissions are private by default.
- The system should support duplicate detection and linking multiple submissions to one claim.

### FR-4: Editorial investigations

- Authorized users can create an investigation from a submission or an existing claim.
- An investigation stores ownership, workflow status, notes, and related evidence.
- Users can add, edit, and organize sources and evidence subject to permissions.
- Original claim wording and context should be preserved, not silently replaced by a normalized summary.

### FR-5: Evidence and source provenance

Each source/evidence record should support, as applicable:

- URL and source title.
- Publisher/author and publication date.
- Date/time retrieved.
- Relevant excerpt or notes.
- Whether the item supports, contradicts, or contextualizes the claim.
- Reliability/context notes.
- Link to the investigation and the user who added it.

Important quotations and claims must be checked against the original source before publication. AI-produced citations must be verified by a human.

### FR-6: AI-assisted research

AI features may:

- Suggest search queries and potential sources.
- Summarize retrieved source material.
- Extract relevant passages.
- Suggest counter-evidence and missing context.
- Produce draft outlines and language-editing suggestions.

AI features must not:

- Publish articles.
- Independently assign the final public verdict.
- Invent sources or represent unverified sources as real.
- Override editorial policy or approval requirements.

Record the provider/model, task type, time, relevant source references, prompt/template version where practical, and generated output. Make AI-generated content identifiable to editors.

### FR-7: Review and approval

- Review decisions and comments are recorded with user and timestamp.
- Editors can request changes with a reason.
- Approval is a distinct action from editing.
- The author cannot approve their own work.
- Only an authorized approver can approve publication.
- Publication checks required evidence, review state, verdict, language status, and article content.
- Publication creates a version snapshot and audit event.

### FR-8: Bilingual content

- Tibetan and English versions are linked to one fact-check identity.
- Each language version has its own draft/review/published state.
- The team can clearly indicate if a translation is pending or unavailable.
- Do not silently publish machine translation as reviewed human-approved copy.
- Search should support both languages as far as the selected search technology permits.

### FR-9: Archive

Archive visibility values:

- `PUBLIC_METADATA`
- `PUBLIC_DOCUMENT`
- `INTERNAL`
- `RESTRICTED`

Requirements:

- Default new archive items to `INTERNAL`.
- A published fact-check does not automatically make its underlying documents public.
- Store private files in private object storage.
- Re-check authorization before providing a download link.
- Use short-lived signed URLs only after permission checks.
- Log access to restricted documents.
- Keep private research notes and submitter personal information separate from public article data.

### FR-10: Audit and corrections

- Record who performed important actions and when.
- Audit approval, publication, role changes, archive access, and correction events.
- Published article versions should be immutable snapshots.
- Corrections should create a new version or explicit correction record, not silently erase the old publication history.
- Avoid logging secrets, authentication tokens, or unnecessary personal data.

## 9. Product design and information architecture

### Public site navigation

- Home
- Fact-checks
- Topics
- About / Methodology
- Submit a claim
- Language switcher: Tibetan / English

### Public home page

Recommended sections:

1. Brief mission statement and prominent search.
2. Latest fact-checks.
3. Topic/category entry points.
4. How the fact-checking process works.
5. Submit-a-claim call to action.
6. Methodology, corrections, and contact/policy links.

### Search/results page

- Search field.
- Filters for verdict, topic, language, and date where useful.
- Clear empty state.
- Result cards with title, verdict, summary, and publication date.
- Pagination or accessible “load more” behavior.

### Fact-check article page

Suggested content order:

1. Title.
2. Verdict label and concise explanation.
3. Claim being checked.
4. Context and analysis.
5. Evidence for and against the claim.
6. Conclusion and limitations/uncertainty.
7. Sources.
8. Correction/version information.
9. Linked translation.

### Editorial dashboard

Recommended sections:

- **Inbox:** new submissions, duplicates, triage state.
- **Investigations:** assigned work and workflow status.
- **Investigation workspace:** claim, source list, evidence, notes, AI research results.
- **Draft editor:** article content and verdict proposal.
- **Review queue:** pending review and requested changes.
- **Approval queue:** work ready for independent approval.
- **Archive:** document metadata, classification, access controls.
- **Audit history:** sensitive actions and publication history.

Design principles for the editorial dashboard:

- Show status and next action clearly.
- Distinguish public article text from internal notes visually and structurally.
- Make source provenance easy to inspect.
- Require confirmation for irreversible or sensitive actions.
- Never make an item public merely because a user changes a frontend control.
- Ensure the interface is usable on laptop-sized screens and remains accessible on smaller devices.

## 10. Technical architecture

### Recommended stack

| Layer | Choice | Responsibility |
|---|---|---|
| Frontend | React + TypeScript, or the project's existing frontend | Public website and editorial dashboard |
| API | FastAPI | Validation, business rules, authentication, workflow, AI coordination |
| Database | PostgreSQL | Structured product and editorial data |
| ORM | SQLAlchemy 2.x | Database models and queries |
| Migrations | Alembic | Versioned database schema changes |
| Background tasks | Add a queue/worker when required | Long-running source retrieval and AI tasks |
| File storage | Private object storage | Archive documents and uploads |
| AI provider | API-based model provider | Research assistance and draft support |
| Testing | pytest + API/client tests | Permission, workflow, and endpoint tests |

### Suggested backend layout

```text
backend/
  app/
    main.py
    api/routes/
      auth.py
      public_factchecks.py
      submissions.py
      investigations.py
      reviews.py
      archive.py
    core/
      config.py
      security.py
      permissions.py
    db/
      session.py
      base.py
    models/
    schemas/
    services/
      factcheck_workflow.py
      evidence.py
      ai_research.py
      publication.py
  alembic/
  tests/
```

### Core data entities

- `User`
- `Submission`
- `Claim`
- `Investigation`
- `Source`
- `EvidenceItem`
- `ResearchRun`
- `Review`
- `FactCheck`
- `ArticleVersion`
- `Translation`
- `ArchiveDocument`
- `AccessGrant`
- `AuditEvent`

A claim can have multiple submissions. An investigation can have many sources and evidence items. A fact-check can have multiple article versions and language translations.

### Illustrative API routes

| Purpose | Example route | Access |
|---|---|---|
| List published fact-checks | `GET /api/v1/factchecks` | Public; published fields only |
| Read a published fact-check | `GET /api/v1/factchecks/{slug}` | Public |
| Submit a claim | `POST /api/v1/submissions` | Public with validation/rate limits |
| Current user | `GET /api/v1/me` | Authenticated |
| Triage submission | `POST /api/v1/editorial/submissions/{id}/triage` | Authorized editorial role |
| Create investigation | `POST /api/v1/investigations` | Authorized editorial role |
| Add evidence | `POST /api/v1/investigations/{id}/evidence` | Authorized and object-scoped |
| Request changes | `POST /api/v1/factchecks/{id}/request-changes` | Authorized editor |
| Approve fact-check | `POST /api/v1/factchecks/{id}/approve` | Authorized independent approver |
| Publish fact-check | `POST /api/v1/factchecks/{id}/publish` | Authorized; workflow checks required |
| Request archive link | `POST /api/v1/archive/documents/{id}/access-link` | Permission check required |

These route names are illustrative. Request/response schemas should explicitly define public fields and must not serialize private database fields by default.

## 11. Security, privacy, and operational requirements

### Access control

- Enforce authentication and authorization in the backend.
- Check both role permissions and access to the specific record.
- Filter private records in database queries before pagination.
- Never rely on hiding a button or route in the frontend as a security measure.
- Do not assume platform administrators should see restricted research materials by default.

### Safe URL retrieval

User-provided URLs can be malicious. If the platform fetches a URL:

- Block localhost, private IP ranges, link-local addresses, and internal service destinations.
- Validate redirects and DNS resolutions.
- Apply strict timeouts and response-size limits.
- Restrict file types and avoid executing downloaded content.
- Do not forward internal credentials or secrets to fetched websites.

### AI prompt injection and sensitive data

- Treat webpages, documents, and retrieved text as untrusted content.
- Instructions found inside source material must not override the system's research policy.
- Avoid sending private notes, restricted documents, or submitter personal information to external AI services without an approved data policy.
- Make it possible to inspect the source material behind AI-generated summaries.
- Keep human review mandatory.

### Basic operational safeguards

- Store credentials in environment variables or a secrets manager.
- Use HTTPS in production.
- Set request size limits and rate limits.
- Validate uploads and scan them where feasible.
- Maintain backups and test restoration.
- Define data-retention rules for submissions and personal information.
- Avoid sensitive data in application logs.
- Monitor errors and AI usage/cost.

## 12. Non-functional requirements

### Reliability

- Critical publication operations should use database transactions.
- Approval and publication invariants should be enforced in application logic and, where practical, database constraints.
- Failed AI tasks should be retryable without duplicating records or publishing content.

### Performance

- Public list endpoints should paginate.
- Add indexes for published status, language, verdict, dates, and common search fields.
- Avoid premature infrastructure complexity; optimize based on actual usage.

### Accessibility and usability

- Keyboard-accessible navigation and forms.
- Sufficient contrast and visible focus states.
- Clear labels and validation errors.
- Verdicts must not be communicated by color alone.
- Responsive layouts for common desktop and mobile widths.
- Tibetan font rendering and text input must be tested on target devices.

### Maintainability

- Use migrations for database changes.
- Keep API schemas separate from database models.
- Add automated tests for critical permissions and transitions.
- Document environment setup, deployment, backup, and restore procedures.

## 13. MVP acceptance criteria

The MVP is ready for a controlled launch when:

1. Visitors can search and read only published fact-checks.
2. Visitors can submit a claim without receiving access to editorial records.
3. Authorized researchers can create investigations and add sources/evidence.
4. Editors can request changes and cannot bypass independent approval.
5. An author cannot approve their own work.
6. An authorized approver can approve another person's work.
7. Publication creates an article-version snapshot and audit event.
8. Private archive documents remain inaccessible through guessed IDs or public URLs.
9. Public API responses do not leak private notes or submitter contact information.
10. Published conclusions expose relevant sources and the editorial reasoning.
11. Tibetan and English versions have separate review/publishing states.
12. Automated tests cover unauthorized access, self-approval, workflow transitions, and public/private field separation.
13. The team has documented verdict definitions, correction policy, and source standards.

## 14. Suggested implementation plan

### Sprint 1 — Foundation

- Set up FastAPI, PostgreSQL, SQLAlchemy, and Alembic.
- Implement configuration and health endpoint.
- Define core entities and first migration.
- Add authentication and basic role model.
- Create tests and a reproducible local setup.

### Sprint 2 — Editorial safety

- Implement permission helpers and object-level checks.
- Add submission intake and triage.
- Add investigations, sources, and evidence.
- Implement archive classification and private-by-default storage metadata.
- Test access-control edge cases.

### Sprint 3 — Review and publication

- Implement workflow transitions.
- Add review comments and request-changes action.
- Enforce independent approval and no self-approval.
- Create immutable article-version snapshots.
- Add audit events and correction flow.

### Sprint 4 — Public experience

- Implement public search and article detail endpoints.
- Build submission form and article pages.
- Add bilingual linking and language-specific status.
- Test public/private response separation and accessibility.

### Sprint 5 — AI-assisted research

- Add AI research runs with source provenance and usage limits.
- Provide source summarization and draft-outline support.
- Add counter-evidence prompts and human verification steps.
- Keep all AI outputs private until reviewed.
- Evaluate quality and cost before enabling wider automation.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| AI fabricates sources or misreads context | Require source verification, retain source excerpts/URLs, and review counter-evidence |
| Private research leaks into public output | Separate data models/schemas, enforce server-side permissions, and test for leakage |
| Author approves their own work | Enforce author/approver separation in the backend and test it |
| Costs grow with AI use | Add budgets/limits, log cost per research run, and begin with selected workflows |
| Monitoring produces too much low-quality material | Start with a curated source list and explicit triage |
| Translation changes meaning | Track each language version separately and require editorial review |
| Sensitive submitter information is retained unnecessarily | Minimize collection, document retention, restrict access, and delete according to policy |
| Team cannot maintain too many features | Keep the MVP small; defer advanced monitoring, comments, and analytics |

## 16. Open decisions before implementation

Resolve these with the founding/editorial team:

1. Which Tibetan script/register and terminology standards will be used?
2. Who is allowed to submit claims, and what privacy promise can realistically be made?
3. Which sources are considered primary, credible secondary, or context-only?
4. What exact evidence standard and verdict definitions will be published?
5. Does every language version require separate approval before it goes live?
6. Which archive documents can be public, internal, or restricted, and who grants access?
7. Which AI provider and data-handling terms are acceptable?
8. What is the correction, appeal, and takedown policy?
9. Who is authorized to approve publication when the team is small?
10. Which hosting/database/storage services meet the budget and data-residency needs?

## 17. Final recommendation

Build Tibetan FactCheck as a **small, bilingual, evidence-first publishing system with a private editorial workflow**. FastAPI is a reasonable backend choice for the planned AI research pipeline, provided the project explicitly builds authentication, permissions, editorial administration, auditability, and publication safeguards.

The first release should prove that a claim can move safely from submission to investigation to independently approved publication. AI-assisted research and monitoring should be added in controlled stages only after that foundation is reliable.
