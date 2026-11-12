# Tibetan Verification Network — Phase 5 Implementation Plan

PRODUCT: Tibetan Verification Network (TVN) · PHASE: 5 · DELIVERY: Four implementation phases

Your Phase 5 requirements are now sufficiently defined. The plan below consolidates all 47 decisions into an implementation roadmap for your existing application.

The central objective is to turn TVN into a human-governed, AI-assisted research and fact-checking platform capable of investigating claims across languages and source types, preserving evidence, assisting editorial decisions, and producing traceable fact-checking articles.

## Confirmed technical foundation

| Area | Choice |
| --- | --- |
| Frontend | React + TypeScript |
| Backend | FastAPI |
| Database | PostgreSQL |
| ORM / migrations | SQLAlchemy 2.x / Alembic |
| Architecture | Modular extension |
| AI architecture | Multi-provider with intelligent routing |
| Editorial authority | Human approval at every critical decision |

## 1. Overall delivery roadmap

1. Phase 1 — AI foundation and platform architecture

   Foundation

   Build provider integrations, job processing, research data models, security, auditability, and administration.
2. Phase 2 — Intelligent research and evidence discovery

   Research engine

   Build multilingual research, source discovery, extraction, translations, multimedia processing, and research reports.
3. Phase 3 — Editorial intelligence and investigation workspace

   Editorial workflow

   Build claim lifecycle management, evidence review, verdict assistance, article drafting, collaboration, and notifications.
4. Phase 4 — Evaluation, security, operational readiness and launch

   Production readiness

   Complete evaluation, monitoring, cost management, retention, incident handling, testing, and controlled rollout.

Important scope decision: You selected Option C for Q46. Therefore, the first production release is not just a basic AI research prototype. It includes the complete editorial AI workflow, including multimedia analysis, claim lifecycle management, verdict assistance, article drafting, and collaboration. Phase 4 ensures these capabilities are safe and production-ready.

# Phase 1 — AI foundation and platform architecture



Build first

Infrastructure and backend foundation



## Objective

Create the infrastructure that allows TVN to use multiple AI providers, external research services, background jobs, and structured research records without disrupting existing Phase 1–4 functionality.

### 1.1 Modular backend architecture

Introduce a dedicated Phase 5 module structure.

Suggested backend organization:

```
backend/
├── app/
│   ├── existing_modules/
│   │   ├── users/
│   │   ├── claims/
│   │   ├── sources/
│   │   ├── evidence/
│   │   └── articles/
│   │
│   ├── ai/
│   │   ├── providers/
│   │   │   ├── base.py
│   │   │   ├── registry.py
│   │   │   ├── router.py
│   │   │   └── adapters/
│   │   ├── prompts/
│   │   ├── tasks/
│   │   ├── evaluations/
│   │   └── security/
│   │
│   ├── research/
│   │   ├── investigations/
│   │   ├── research_runs/
│   │   ├── research_plans/
│   │   ├── findings/
│   │   └── reports/
│   │
│   ├── connectors/
│   │   ├── base.py
│   │   ├── web_search/
│   │   ├── webpage/
│   │   ├── academic/
│   │   ├── news/
│   │   ├── official/
│   │   ├── ngo/
│   │   ├── social/
│   │   └── archive/
│   │
│   ├── editorial/
│   ├── notifications/
│   ├── audit/
│   └── config/
```

These are proposed logical modules, not a requirement to create every directory immediately. Preserve the existing application structure wherever it already provides equivalent functionality.

### 1.2 AI provider abstraction

Implement a common provider interface so TVN is not locked into one AI company.

Example:

```python
class AIProvider:
    async def generate(self, request): ...
    async def generate_structured(self, request): ...
    async def generate_embedding(self, request): ...
    async def health_check(self): ...
```

Build:

- Provider registry.
- Provider adapters.
- Model configuration.
- Intelligent task-based routing.
- Manual provider/model override for authorized editors.
- Provider-specific usage and cost tracking.
- Structured JSON output validation.
- Timeout and retry handling.

Intelligent routing examples:

| Task                      | Preferred model capability              |
| ------------------------- | --------------------------------------- |
| Search query generation   | Fast, inexpensive                       |
| Source summarization      | Efficient summarization                 |
| Evidence extraction       | Structured-output capable               |
| Counter-evidence analysis | Advanced reasoning                      |
| Translation               | Strong Tibetan/multilingual performance |
| Article drafting          | High-quality writing                    |
| Verdict suggestions       | Advanced reasoning                      |

Provider and model selections must be configurable. Do not hardcode one model for every task.

### 1.3 Background research job infrastructure

Research must run asynchronously rather than blocking API requests.

Implement:

- Background job queue.
- Job status and progress.
- Retryable failures.
- Idempotency keys.
- Partial result preservation.
- Resume and restart functionality.
- Configurable timeouts and retry limits.
- Provider fallback.
- Job execution history.

Suggested job lifecycle:

```
QUEUED
  ↓
RUNNING
  ↓
COMPLETED

RUNNING → PARTIALLY_COMPLETED
RUNNING → RETRYING
RETRYING → FAILED
```

A failed research operation must not destroy previously completed work.

### 1.4 Core database entities

Extend the existing database conservatively.

Proposed new entities:

| Entity                | Purpose                                     |
| --------------------- | ------------------------------------------- |
| Investigation         | Central research workspace                  |
| InvestigationClaim    | Claims associated with an investigation     |
| ResearchPlan          | Approved research strategy                  |
| ResearchRun           | Individual AI research execution            |
| ResearchTask          | Individual research operations              |
| ResearchFinding       | Extracted research findings                 |
| ProposedEvidence      | AI-extracted evidence awaiting human review |
| ProviderExecution     | Provider/model execution and usage          |
| PromptTemplateVersion | Versioned prompt configuration              |
| ResearchLanguage      | Languages used during research              |
| InvestigationActivity | Investigation activity history              |

Existing `Claim`, `Source`, `EvidenceItem`, and `Article` entities should be reused where possible.

Do not create duplicate representations of existing source and evidence records.

### 1.5 Security and data protection

Implement these controls from the beginning:

- Redact submitter identities and personal data before external AI sharing.
- Exclude restricted documents by default.
- Separate system instructions from retrieved source content.
- Validate AI outputs against schemas.
- Protect against prompt injection.
- Restrict AI tool permissions.
- Sanitize retrieved webpage content.
- Prevent SSRF and unsafe redirects.
- Validate URLs, domains, IP addresses, and response sizes.
- Maintain secure logs without exposing sensitive research.
- Enforce existing role permissions.

### Phase 1 deliverables

- AI provider framework.
- Configurable provider routing.
- Background job infrastructure.
- Research and investigation database models.
- Prompt versioning.
- Audit logging.
- External data-sharing controls.
- Feature flags and basic admin configuration.
- Automated regression tests for existing Phase 1–4 functionality.

Phase 1 exit criteria: TVN can execute a controlled AI job, record its provider/model and usage, preserve its results, retry failures safely, and enforce existing access controls.

# Phase 2 — Intelligent research and evidence discovery



Core AI functionality

Research engine and source integrations



## Objective

Allow researchers to investigate claims using multiple sources and languages, with AI assisting discovery, extraction, translation, and analysis.

This is the main research engine of TVN.

## 2.1 Investigation intake

Create a structured investigation creation process.

Researchers should be able to provide:

- Claim text.
- Multiple related claims.
- Source URLs.
- Uploaded documents.
- Images.
- Context and background notes.
- Preferred research languages.
- Research questions.
- Relevant dates and locations.

AI should be able to:

1. Understand the submitted claim.
2. Identify multiple factual assertions.
3. Decompose complex claims.
4. Recommend research questions.
5. Identify missing context.
6. Propose a research plan.

The editor must approve the investigation plan before research begins.

## 2.2 Guided investigation workflow

Build a multi-step research pipeline.

1. Claim understanding and decomposition
2. Research question generation
3. Tibetan, English and additional language query generation
4. Search across selected source categories
5. Source discovery and preview
6. Editor source selection
7. Full source retrieval and extraction
8. Evidence classification and comparison
9. Counter-evidence and missing-context analysis
10. Structured research dossier generation

Research depth presets:

| Preset   | Behavior                                             |
| -------- | ---------------------------------------------------- |
| Quick    | Limited queries, sources, and processing             |
| Standard | Balanced research coverage                           |
| Deep     | More research iterations and broader source coverage |

Administrators configure limits for sources, search iterations, processing time, and cost.

## 2.3 Source connector system

Build a standardized connector interface.

```python
class SourceConnector:
    async def search(self, query, filters): ...
    async def retrieve(self, source_id): ...
    async def extract_metadata(self, document): ...
    async def health_check(self): ...
```

Initial integration categories:

| Category         | Examples of integration type                |
| ---------------- | ------------------------------------------- |
| General internet | Search APIs                                 |
| News/media       | News search and publisher sources           |
| Academic         | Scholarly publication APIs                  |
| Government       | Official datasets and publications          |
| NGOs             | Human-rights and institutional publications |
| Social media     | Permitted platform APIs                     |
| TVN archive      | Internal approved documents and sources     |

Use an incremental integration strategy. Start with web search, safe webpage extraction, and the internal archive, then expand to academic, official, news, NGO, and permitted social sources.

### Source approval controls

Implement:

- Configurable domain allowlists.
- Configurable blocklists.
- Source preview before full retrieval.
- Publisher and publication date extraction.
- Relevance explanations.
- Approval status.
- Source selection by researchers.

A source discovered by AI must not automatically become approved evidence.

## 2.4 Multilingual research

Tibetan and English are the primary research languages.

The architecture should also support Chinese and other configurable languages.

For every translated passage, preserve:

- Original passage.
- Original language.
- Translated passage.
- Translation language.
- Provider and model.
- Translation timestamp.
- Quality assessment.
- Reviewer approval status.
- Link to the original source passage.

Human review required

AI-generated translations must be labelled unverified until approved by a qualified reviewer. Unreviewed translations cannot be used as verified quotations.

## 2.5 Evidence extraction and assessment

Each proposed evidence item should contain:

| Field                  | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| Source                 | Source URL, publisher, title                                 |
| Publication date       | When the source was published                                |
| Retrieval date         | When TVN accessed it                                         |
| Exact passage          | Original text                                                |
| Translation            | Optional translated passage                                  |
| Location               | Page, section, paragraph, timestamp                          |
| Classification         | Supporting, Contradicting, Contextual, Insufficient, Unclear |
| Relevance              | Why the passage matters                                      |
| Credibility assessment | Multi-dimensional evaluation                                 |
| Uncertainty            | Limitations or ambiguity                                     |
| Provenance             | Extraction and processing history                            |

AI should assess source and evidence quality across dimensions such as:

- Primary versus secondary source.
- Transparency.
- Expertise.
- Evidence quality.
- Corroboration.
- Recency.
- Potential conflicts of interest.
- Potential bias.
- Methodological limitations.

Avoid a single automatic trust score that treats source categories or political alignment as a substitute for evidence evaluation.

Researchers can accept, reject, or edit proposed evidence. Accepted evidence must still go through the appropriate evidence approval workflow.

## 2.6 Multimedia evidence analysis

Support:

- OCR for images and scanned documents.
- Audio transcription.
- Video transcription.
- Video summaries.
- Timestamp extraction.
- Relevant frame extraction.
- Image descriptions.
- Contextual analysis.
- Relevant passage extraction.

All extracted multimedia information remains provisional until human verification.

Advanced forensic authenticity detection is outside the selected launch scope.

## 2.7 Research reports

Generate two separate outputs:

A. Research report

- Claim summary.
- Research questions.
- Search strategy.
- Findings.
- Background context.
- Conflicting information.
- Missing evidence.
- Research limitations.
- Recommended next steps.

B. Proposed evidence collection

- Individual source references.
- Exact passages.
- Translations.
- Evidence classifications.
- Relevance explanations.
- Uncertainty indicators.

Keep both outputs separate from accepted evidence and published articles until explicitly adopted.

### Phase 2 deliverables

- Investigation intake.
- Guided research planning.
- Source connector framework.
- Search and webpage extraction.
- Multilingual research.
- Translation workflow.
- Source preview and selection.
- Evidence extraction.
- Multi-dimensional source assessment.
- Multimedia processing.
- Research reports and proposed evidence.
- Research progress and history.

Phase 2 exit criteria: A researcher can submit a claim, approve a research plan, discover and select sources, run multilingual research, inspect evidence passages, and produce a traceable research dossier.

# Phase 3 — Editorial intelligence and investigation workspace



Complete editorial workflow

Research-to-publication experience



## Objective

Connect AI research with TVN's existing claim, evidence, verdict, and article workflows.

This phase transforms the research engine into a usable fact-checking product for the editorial team.

## 3.1 Hybrid investigation workspace

You selected Option C for Q47.

Build two connected experiences:

A. Central AI Research dashboard

[Research Management System — David X. Avila](https://images.openai.com/static-rsc-4/YSkfeJcnknmGOoXjZy7q1gOdRboQPHYxMxjijcpw-ChDcu8hjAermADpdzn2BWpAZLXURP0Ci-rWs7b1iPul6-D6be7_mPGS902QLULWLr5GwBf1vww5vICOA6HxRJG3OPbswEP303c4lG6_MZgaZfPmagEk1RhE1PeegsXiRkw?purpose=inline)

[davidxavila.com](https://www.davidxavila.com/en/case-studies/research-management-system?utm_source=chatgpt.com)

The dashboard should provide:

- All research investigations.
- Active and completed research jobs.
- Failed or partially completed jobs.
- Research status.
- Assigned researcher.
- Manual priority.
- Due date.
- Last activity.
- Research cost and provider usage.
- Filters for status, priority, owner, and date.

B. Individual investigation workspace

[Pulse | Local-First OSINT & Investigative Text Analysis Platform](https://images.openai.com/static-rsc-4/NQ9ChGgCtSqLPqybONYscUzj3_dHwQ3HByoBwX3GC3iOkW9P4Qy6UrwJ4ClsBWHDkhQweN-4vf0ajn1aVyN4TpA9KbiiUNXeGC5zDQoOYSzAifYxJk7o_V5lPm4DyDxC6N0ESWJHmAqWJjUlQi-qPJLmXNuSeAKGkl1zARxxSow?purpose=inline)

[osirt.co.uk](https://www.osirt.co.uk/pulse/?utm_source=chatgpt.com)

Suggested navigation:

| Section         | Functionality                                |
| --------------- | -------------------------------------------- |
| Overview        | Claim, investigation status, priority, owner |
| Research Plan   | Questions, languages, selected sources       |
| AI Research     | Research runs, progress, reports             |
| Sources         | Discovered, selected, approved, blocked      |
| Evidence        | Proposed and approved evidence               |
| Analysis        | Supporting and contradicting information     |
| Risk Assessment | Privacy, safety, publication risks           |
| Verdict         | Methodology and provisional verdict          |
| Article         | Evidence-based draft editor                  |
| Activity        | Comments, assignments, decisions, history    |

The central dashboard manages research across investigations. The individual workspace contains the full context and editorial decisions for each case.

## 3.2 Claim relationship and lifecycle management

Implement the claim lifecycle system selected in Q38.

AI should compare newly submitted claims against historical claims and recommend whether they are:

1. Exact duplicates.
2. Semantically related claims.
3. Materially changed versions.
4. New claims.

Use comparisons involving:

- Claim meaning.
- Entities.
- Dates.
- Locations.
- Events.
- Context.
- Factual assertions.

Editors confirm relationships.

Maintain:

- Claim version history.
- Original and modified claim relationships.
- Previous investigations.
- Historical evidence.
- Previous verdicts.
- Changes in supporting and contradicting evidence.
- Historical verdict comparisons.
- Flags for potentially outdated verdicts.
- Related-claim networks.
- Reappearing claims and emerging developments.

Important: A historical verdict must never automatically apply to a materially changed claim.

Researchers should be able to reuse previously approved research while checking whether its sources and evidence remain relevant.

## 3.3 Structured editorial workflow

Implement a configurable investigation workflow.

Suggested default lifecycle:

```
SUBMITTED
    ↓
INTAKE_REVIEW
    ↓
INVESTIGATION_CREATED
    ↓
RESEARCH_PLAN_REVIEW
    ↓
RESEARCH_IN_PROGRESS
    ↓
SOURCE_REVIEW
    ↓
EVIDENCE_REVIEW
    ↓
RESEARCH_COMPLETE
    ↓
VERDICT_REVIEW
    ↓
ARTICLE_DRAFT
    ↓
EDITORIAL_REVIEW
    ↓
APPROVED
    ↓
PUBLISHED
```

Additional states:

```
ON_HOLD
NEEDS_MORE_RESEARCH
REJECTED
REOPENED
CANCELLED
```

Allow administrators to configure:

- Workflow stages.
- Valid transitions.
- Required fields.
- Approval checkpoints.
- Different workflows for different investigation types.
- Task dependencies.
- Parallel tasks.
- Reviewer assignments.
- Escalation rules.
- Investigation reopening.

Your existing roles and permissions will be reused rather than introducing new roles.

## 3.4 Manual priority and deadline management

Respect your decisions for Q40 and Q41.

Priority: Editors manually select:

- Low
- Normal
- High
- Urgent

AI does not automatically assign editorial priority.

Deadlines: Editors manually assign due dates to investigations and tasks.

TVN displays:

- Upcoming deadlines.
- Overdue investigations.
- Overdue tasks.
- Assigned owners.
- Current workload and status.

Do not build automatic reminders or escalation for overdue tasks in this scope.

## 3.5 Evidence approval and editorial decisions

Implement separate approval stages:

| Stage               | Responsible action                      |
| ------------------- | --------------------------------------- |
| Source discovery    | AI proposes source candidates           |
| Source selection    | Researcher selects relevant sources     |
| Source approval     | Researcher approves; editor oversees    |
| Evidence extraction | AI proposes evidence passages           |
| Evidence review     | Researcher accepts, edits, or rejects   |
| Evidence approval   | Authorized human approves               |
| Verdict review      | Editor evaluates evidence               |
| Final verdict       | Human editorial decision                |
| Publication         | Authorized human approves and publishes |

Support additional approval requirements for sensitive and high-impact investigations.

An evidence approval must not imply verdict approval. A verdict approval must not imply publication approval.

## 3.6 AI-assisted verdict methodology

Create a comprehensive TVN fact-checking framework.

It should define:

- Verdict labels and their meanings.
- Claim decomposition.
- Evidence standards.
- Source assessment.
- Corroboration requirements.
- Treatment of conflicting accounts.
- Uncertainty.
- Special cases.
- Insufficient evidence conditions.

AI may produce a provisional verdict suggestion with:

- Suggested label.
- Supporting evidence.
- Contradicting evidence.
- Relevant context.
- Evidence gaps.
- Reasoning.
- Uncertainty and limitations.

Editors independently determine the final verdict.

AI must never approve or publish a verdict.

## 3.7 Evidence-based article drafting

Implement AI-assisted article generation using only editor-approved evidence.

Capabilities:

- Generate an outline.
- Draft individual sections.
- Generate full article drafts.
- Rewrite and improve clarity.
- Suggest headlines and summaries.
- Improve Tibetan and English language quality.
- Identify unsupported statements.
- Flag contradictory statements.
- Attach citations to factual claims.

Every factual statement should be traceable to approved evidence.

Editors must be able to modify, reject, and manually adopt generated content.

The existing bilingual publishing model must remain intact:

- Tibetan and English have independent review states.
- A published language version can display translation pending.
- AI-generated content cannot automatically become published content.

## 3.8 Collaborative editorial workspace

Build:

- Investigation ownership.
- Collaborator assignments.
- Task assignment and dependencies.
- Reviewer assignments.
- Internal discussions and comments.
- Conflict resolution.
- Concurrent-edit protection.
- Sensitive-investigation access restrictions.
- Full activity history.

Use the existing staff accounts and role system.

## 3.9 Notifications

Implement your selected in-app + email approach.

Notification events should include:

- New task assignment.
- Review request.
- New comment or mention.
- Source approval or rejection.
- Evidence review request.
- Investigation status change.
- Verdict review request.
- Article review request.
- Publication status change.

Users should be able to configure preferences by event type and channel.

## 3.10 Public AI transparency

Implement article-level disclosure of AI involvement.

Provide a public methodology and transparency page explaining:

- How TVN uses AI.
- Which editorial tasks use AI.
- How human oversight works.
- Limitations of AI-generated research and translation.
- Provider and model usage policies.
- Evaluation and quality standards.
- How TVN prevents AI from independently determining verdicts or publishing content.

Do not expose confidential prompts, private research notes, personal information, or restricted source material.

### Phase 3 deliverables

- Central AI research dashboard.
- Individual investigation workspace.
- Claim duplicate and relationship management.
- Claim version history.
- Historical investigation reuse.
- Configurable editorial workflow.
- Manual priority and deadline controls.
- Evidence approval workflow.
- Verdict assistance.
- TVN verdict methodology.
- AI-assisted article drafting.
- Collaborative workspace.
- In-app and email notifications.
- Public AI transparency.

Phase 3 exit criteria: The editorial team can move an investigation from submission through research, evidence review, verdict decision, article drafting, editorial approval, and publication, with human accountability and a complete history.

# Phase 4 — Evaluation, security, operational readiness and launch



Production readiness

Quality, governance and controlled release



## Objective

Make the system reliable, secure, cost-controlled, measurable, and ready for real editorial use.

Phase 4 is not simply a final testing phase. Several of its capabilities, especially security and audit logging, must be developed alongside Phases 1–3 and completed here.

## 4.1 AI quality evaluation framework

Build a bilingual evaluation dataset using representative Tibetan and English claims and source material.

Evaluate:

| Evaluation area     | What to measure                                             |
| ------------------- | ----------------------------------------------------------- |
| Citation fidelity   | Does the output accurately reflect the source?              |
| Unsupported claims  | Does AI introduce facts not supported by supplied evidence? |
| Evidence extraction | Are relevant passages extracted correctly?                  |
| Counter-evidence    | Does AI identify important opposing evidence?               |
| Research usefulness | Does the research help investigators?                       |
| Translation quality | Is the translation accurate and contextually appropriate?   |
| Tibetan usefulness  | Does the system work effectively with Tibetan content?      |
| Verdict assistance  | Are suggestions consistent with the TVN methodology?        |
| Latency             | How long does each task take?                               |
| Cost                | What is the cost per task and investigation?                |

Compare providers and models using the same benchmark dataset.

Implement:

- Automated evaluation.
- Human reviewer scoring.
- Provider comparisons.
- Regression testing.
- Quality thresholds.
- Model configuration approval.

Do not deploy a provider/model configuration that fails the required quality thresholds.

## 4.2 AI operations and cost management

Build an AI operations dashboard.

Track usage by:

- Provider.
- Model.
- Task type.
- User.
- Investigation.
- Time period.

Include:

- Token consumption.
- Estimated cost.
- Usage trends.
- Provider comparisons.
- Routing analytics.
- Budget limits.
- Per-user and per-role quotas.
- Investigation budgets.
- Cost alerts.
- Usage forecasting.
- Anomaly detection.
- Automatic restrictions when limits are reached.

Make cost and usage controls configurable by administrators.

## 4.3 Source preservation and archival

Implement comprehensive source preservation.

For each source, preserve where legally permitted:

- Original URL.
- Publisher.
- Title.
- Publication date.
- Retrieval timestamp.
- Content hash.
- Versioned snapshot.
- Extracted passages.
- Document locations.
- Translation history.
- Source changes.

Support:

- Change detection.
- Historical source versions.
- Archival retrieval.
- Copyright restrictions.
- Privacy restrictions.
- Retention policies.

A source changing or disappearing should not silently invalidate the provenance of evidence previously extracted from it.

## 4.4 Risk management

Implement a structured investigation risk assessment system.

Risk categories should be configurable and may include:

- Personal safety.
- Source protection.
- Privacy.
- Defamation and legal exposure.
- Sensitive political or human-rights allegations.
- Vulnerable individuals.
- Potential harm from publication.

AI can recommend risk categories and severity, but humans confirm them.

For high-risk investigations:

- Restrict access.
- Require senior-editor approval.
- Apply publication safeguards.
- Preserve risk assessments and decisions.
- Protect sensitive sources and research notes.

## 4.5 Security and prompt-injection protection

Complete layered AI security.

Implement:

- Separation of system instructions and external source content.
- Suspicious instruction detection and filtering.
- Structured input and output validation.
- Restricted AI tool permissions.
- Isolated source processing.
- Sensitive-data protection.
- Secure URL retrieval.
- SSRF protection.
- Role-based access checks.
- File-upload validation.
- Audit logging.

Treat every external webpage, uploaded file, social post, and retrieved document as untrusted data.

## 4.6 Retention and data lifecycle

Implement configurable retention policies.

| Data category           | Proposed handling                    |
| ----------------------- | ------------------------------------ |
| Adopted evidence        | Permanent                            |
| Editorial decisions     | Permanent                            |
| Essential audit records | Permanent or policy-governed         |
| Temporary AI outputs    | Configurable expiration              |
| Unused research results | Configurable expiration              |
| Investigation records   | Preserve according to classification |
| Sensitive records       | Restricted retention and access      |
| Legal-hold records      | Retain until hold is released        |

Include:

- Secure deletion.
- Legal holds.
- Investigation-specific overrides.
- Retention-policy version history.
- Audit trail for policy changes.

## 4.7 Incident management and operational resilience

Build incident handling for provider, connector, and platform failures.

Capabilities:

- Incident detection.
- Severity classification.
- Provider isolation.
- Per-provider and per-feature kill switches.
- Incident records.
- Evidence preservation.
- Administrative investigation and recovery.
- Notifications.
- Post-incident reviews.

Your selected Q44 approach remains fallback and recovery, not full automatic failover. Use retry limits, alternative providers/connectors, partial-result preservation, and resumable research jobs.

## 4.8 Release and deployment management

Implement:

- Feature flags.
- Role-based feature access.
- Per-user usage limits.
- Development, staging, and production environments.
- Database migration testing.
- Backup and recovery procedures.
- Monitoring and alerting.
- Rollback procedures.
- Release acceptance criteria.
- Editorial and administrator signoff.

### Production rehearsal

Run a complete end-to-end scenario:

1. Submit a new claim.
2. Detect related historical claims.
3. Create an investigation.
4. Approve a research plan.
5. Discover sources in Tibetan and English.
6. Select and retrieve sources.
7. Extract evidence.
8. Review translations.
9. Approve evidence.
10. Generate research report.
11. Obtain AI verdict suggestion.
12. Make a human verdict decision.
13. Generate an article draft.
14. Review and approve the article.
15. Publish.
16. Verify public AI disclosure and citations.
17. Verify the audit history and source provenance.

Also rehearse failures, including provider outages, failed extraction, retries, interrupted jobs, access violations, and cost-limit enforcement.

### Phase 4 deliverables

- Bilingual AI evaluation framework.
- Provider/model benchmarking.
- Cost and usage dashboard.
- Source archival and change tracking.
- Risk assessment.
- Security and penetration testing.
- Retention policies.
- Incident management.
- Monitoring and alerts.
- Staging rehearsal.
- Release and rollback checklist.

Phase 4 exit criteria: All critical security and workflow tests pass, AI quality meets configured thresholds, costs and failures are controlled, and the editorial team successfully completes the full production rehearsal.

# 5. Cross-phase technical requirements

These requirements should be maintained throughout all four phases.

## 5.1 Proposed database architecture

The following is a conceptual entity map. Final table names and relationships should be reconciled with your actual Phase 1–4 schema before writing migrations.

Core editorial entities

Claim → ClaimVersion → ClaimRelationship

Investigation → InvestigationClaim → InvestigationTask

Source → SourceVersion → SourcePassage

EvidenceItem ← ProposedEvidence → EvidenceReview

Verdict → VerdictReview → ArticleDraft → PublishedArticle

AI and research entities

ResearchPlan → ResearchRun → ResearchTask → ResearchFinding

AIProvider → ProviderExecution → UsageRecord

PromptTemplate → PromptTemplateVersion → EvaluationResult

Governance entities

InvestigationActivity → AuditLog → Notification

RiskAssessment → RetentionPolicy → IncidentRecord

A critical architectural rule: AI-generated proposed evidence and accepted EvidenceItems must remain distinct.

Only an explicit human action should promote proposed evidence into the existing approved evidence workflow.

## 5.2 Important API groups

Suggested FastAPI endpoint organization:

| API group                     | Main operations                  |
| ----------------------------- | -------------------------------- |
| `/api/v1/investigations`      | Create, list, update, assign     |
| `/api/v1/research-plans`      | Generate, review, approve        |
| `/api/v1/research-runs`       | Start, monitor, retry, resume    |
| `/api/v1/research-findings`   | Retrieve and review findings     |
| `/api/v1/source-discovery`    | Search and preview sources       |
| `/api/v1/proposed-evidence`   | Accept, reject, edit             |
| `/api/v1/source-reviews`      | Approve and reject sources       |
| `/api/v1/claim-relationships` | Find and manage related claims   |
| `/api/v1/claim-versions`      | Compare and track versions       |
| `/api/v1/verdict-assistance`  | Generate provisional suggestions |
| `/api/v1/article-assistance`  | Generate and revise drafts       |
| `/api/v1/ai-providers`        | Provider configuration           |
| `/api/v1/ai-operations`       | Usage and costs                  |
| `/api/v1/evaluations`         | Evaluation and benchmarks        |
| `/api/v1/notifications`       | In-app and email notifications   |
| `/api/v1/audit`               | Editorial and research history   |

Use pagination, authorization, structured validation, and consistent error responses.

For long-running research, use job IDs and status polling or an appropriate push mechanism. Never make a browser request wait for an entire investigation to finish.

## 5.3 Non-negotiable governance rules

| Rule                     | Requirement                               |
| ------------------------ | ----------------------------------------- |
| AI verdict               | Suggestion only                           |
| Final verdict            | Human decision                            |
| Publication              | Human approval                            |
| AI translations          | Human review before verified use          |
| Source discovery         | Human selection and approval              |
| Evidence extraction      | Human review                              |
| Research plan            | Human approval before execution           |
| Risk assessment          | AI recommendation, human confirmation     |
| Historical research      | Reuse only after relevance review         |
| External data sharing    | Redacted by default                       |
| Sensitive investigations | Restricted access and additional approval |

# 6. Recommended implementation order

Although the project is divided into four phases, each phase should be implemented in smaller, testable milestones.

| Milestone | Work                             | Completion result              |
| --------- | -------------------------------- | ------------------------------ |
| 1         | Inspect existing architecture    | Phase 1–4 compatibility report |
| 2         | Database and backend foundations | New modules and migrations     |
| 3         | AI providers and job processing  | Working AI infrastructure      |
| 4         | Source connectors                | Search and retrieval           |
| 5         | Research pipeline                | Claim-to-research dossier      |
| 6         | Evidence and multimedia          | Reviewable evidence            |
| 7         | Investigation workspace          | Unified research UI            |
| 8         | Editorial intelligence           | Verdict and article assistance |
| 9         | Collaboration and notifications  | Complete editorial workflow    |
| 10        | Evaluation and governance        | Quality and security controls  |
| 11        | Staging and launch               | Production-ready release       |

Recommended engineering rule: For each milestone, follow:

`Design → Implement → Test → Measure → Document → Review`

Do not ask Cursor to implement the entire phase in one large task. Build small vertical slices that can be tested against your existing application.

# 7. What is included in the first production release?

Your Option C decision means the first production release should contain the following:

## TVN Phase 5 release scope

AI research infrastructure

Included

Multilingual research and source integrations

Included

Evidence extraction and multimedia analysis

Included

Claim lifecycle management

Included

AI verdict assistance

Included

Article drafting

Included

Collaborative editorial workflow

Included

Evaluation, security and operational controls

Required for launch

Not included in the selected scope:

- Public reader accounts.
- Public comments or discussion forums.
- Public API access.
- Autonomous verdict approval or publication.
- Automatic editorial priority assignment.
- Advanced multimedia forensic authenticity detection.
- Unrestricted social media scraping.
- Automatic translation publication.

# 8. Final project success criteria

Phase 5 should be considered successful when TVN can demonstrate all of the following:

1. A researcher can submit a complex claim and receive an AI-generated investigation plan.
2. The system can research Tibetan and English sources and support additional configured languages.
3. Researchers can discover and select sources before deeper extraction.
4. Evidence can be traced to original source passages.
5. AI can identify supporting, contradicting, and contextual information.
6. Previous investigations and related claims can be reused safely.
7. Editors can independently approve evidence and determine verdicts.
8. AI can draft articles using approved evidence with traceable citations.
9. The complete investigation history is preserved.
10. Sensitive research and external data sharing are protected.
11. AI quality, cost, provider performance, and operational failures are measurable.
12. The editorial team can complete the full workflow without AI autonomously making publication decisions.

## 9. My recommendation: Start with an architecture audit

Before writing any Phase 5 code, I strongly recommend a read-only audit of your completed Phase 1–4 application.

The audit should establish:

- Existing database tables and relationships.
- Existing Claim, Source, EvidenceItem, and Article models.
- Current user roles and authorization.
- Existing source approval and evidence approval processes.
- Existing API routes and service structure.
- Existing frontend navigation and UI components.
- Existing background task infrastructure, if any.
- Existing testing and migration practices.

This will prevent Cursor from creating duplicate models or replacing working functionality.

The most important design decision: Phase 5 should extend your existing fact-checking platform, not create a second application inside it.

## Final recommendation

Build Phase 5 in the four phases above, but do not begin with AI provider integration. Begin by mapping the existing application and defining the integration contracts. Then build the AI foundation and research pipeline before adding editorial intelligence.

This gives TVN a maintainable architecture, protects the completed work, and makes the final product more credible as an independent fact-checking platform.

Next practical step: I recommend turning this plan into a Cursor-ready Phase 5 master implementation document, with detailed tasks, dependencies, database specifications, API contracts, acceptance criteria, and individual prompts for each milestone.