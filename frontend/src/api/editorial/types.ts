import type { Locale } from "../../i18n/translate";
import type { PublicSnapshot, Verdict, VersionKind } from "../public";
import type { StaffRole } from "../types";

export type WorkflowStatus =
  | "inbox"
  | "triaged"
  | "researching"
  | "drafting"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "rejected"
  | "on_hold";

export const WORKFLOW_STATUSES: readonly WorkflowStatus[] = [
  "inbox",
  "triaged",
  "researching",
  "drafting",
  "in_review",
  "changes_requested",
  "approved",
  "published",
  "rejected",
  "on_hold",
];

export type LanguageStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "ready_for_approval"
  | "approved"
  | "published"
  | "withdrawn";

export type TranslationState = "pending" | "in_review" | "published" | "unavailable";
export const TRANSLATION_STATES: readonly TranslationState[] = [
  "pending",
  "in_review",
  "published",
  "unavailable",
];

export type Stance = "supports" | "contradicts" | "contextualizes";
export const STANCES: readonly Stance[] = ["supports", "contradicts", "contextualizes"];

export type ArchiveVisibility = "public_metadata" | "public_document" | "internal" | "restricted";
export const ARCHIVE_VISIBILITIES: readonly ArchiveVisibility[] = [
  "internal",
  "restricted",
  "public_metadata",
  "public_document",
];

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

/* Intake */

export interface Submission {
  id: string;
  claim_text: string;
  context_text: string | null;
  source_url: string | null;
  channel: "public_form" | "editorial" | "monitoring";
  workflow_status: WorkflowStatus;
  claim_id: string | null;
  assigned_to_id: string | null;
  duplicate_of_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Claim {
  id: string;
  canonical_text: string;
  context_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuplicateSuggestion {
  id: string;
  claim_text: string;
  workflow_status: WorkflowStatus;
  similarity: number | null;
  exact_match: boolean;
}

export interface SubmissionDetail {
  submission: Submission;
  claim: Claim | null;
  duplicate_suggestions: DuplicateSuggestion[];
}

export interface SubmissionContact {
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  privacy_notice_acknowledged: boolean;
}

export type TriageBody =
  | { action: "reject"; reason: string }
  | { action: "hold"; reason: string }
  | { action: "mark_duplicate"; duplicate_of_id: string }
  | { action: "link_to_claim"; claim_id: string }
  | { action: "create_claim"; canonical_text: string }
  | { action: "assign"; user_id: string }
  | { action: "open_investigation" };

/* Staff */

export interface StaffMember {
  id: string;
  email: string;
  display_name: string | null;
  roles: StaffRole[];
}

export interface UserSummary extends StaffMember {
  is_active: boolean;
  disabled_at: string | null;
}

export interface InviteResult {
  invite_id: string;
  email: string;
  expires_at: string;
  token: string;
}

/* Investigations */

export interface InvestigationSummary {
  id: string;
  claim_id: string;
  owner_id: string | null;
  workflow_status: WorkflowStatus;
  created_at: string;
  updated_at: string;
}

export interface InvestigationListItem extends InvestigationSummary {
  claim_text: string;
}

export interface Assignment {
  user_id: string;
  assignment_role: "owner" | "contributor";
  assigned_by_id: string | null;
  assigned_at: string;
  removed_at: string | null;
}

export interface Source {
  id: string;
  investigation_id: string;
  title: string;
  url: string | null;
  publisher: string | null;
  author: string | null;
  published_at: string | null;
  retrieved_at: string | null;
  source_language: string | null;
  reliability_notes: string | null;
  position: number | null;
}

export interface Evidence {
  id: string;
  investigation_id: string;
  excerpt: string | null;
  notes: string | null;
  stance: Stance | null;
  source_id: string | null;
  archive_document_id: string | null;
  position: number | null;
  verified_at: string | null;
  verified_by_id: string | null;
}

export interface InvestigationDetail {
  investigation: InvestigationSummary;
  fact_check_id: string | null;
  claim: Claim;
  internal_notes: string | null;
  hold_reason: string | null;
  reject_reason: string | null;
  assignments: Assignment[];
  sources: Source[];
  evidence_items: Evidence[];
}

export interface SourceInput {
  title: string;
  url?: string | null;
  publisher?: string | null;
  author?: string | null;
  source_language?: string | null;
  reliability_notes?: string | null;
}

export interface EvidenceInput {
  excerpt?: string | null;
  notes?: string | null;
  stance?: Stance | null;
  source_id?: string | null;
  archive_document_id?: string | null;
}

/* Archive */

export interface ArchiveDocument {
  id: string;
  title: string;
  description: string | null;
  visibility: ArchiveVisibility;
  mime_type: string | null;
  byte_size: number | null;
  investigation_id: string | null;
  original_filename: string | null;
  sha256: string | null;
  upload_status: "pending" | "available" | "rejected";
  classified_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArchiveGrant {
  id: string;
  user_id: string;
  granted_by_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface AccessLink {
  url: string;
  expires_at: string;
}

/* Fact-checks */

export interface LanguageBrief {
  language: Locale;
  editorial_status: LanguageStatus;
  title: string | null;
}

export interface FactCheckSummary {
  id: string;
  investigation_id: string | null;
  workflow_status: WorkflowStatus;
  public_slug: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FactCheckListItem extends FactCheckSummary {
  languages: LanguageBrief[];
}

export interface LanguageSummary {
  content_id: string;
  language: Locale;
  editorial_status: LanguageStatus;
  translation_status: TranslationState;
  current_revision_number: number;
  live_version_number: number | null;
  published_at: string | null;
  readiness_issues: string[];
}

export interface FactCheckDetail {
  fact_check: FactCheckSummary;
  languages: LanguageSummary[];
}

export interface DraftSourceRef {
  source_id: string;
  relevance_note: string | null;
  position: number;
}

export interface Draft {
  fact_check_id: string;
  language: Locale;
  editorial_status: LanguageStatus;
  translation_status: TranslationState;
  current_revision_number: number;
  title: string | null;
  summary: string | null;
  claim_text: string | null;
  context_text: string | null;
  verdict: Verdict | null;
  verdict_explanation: string | null;
  analysis_markdown: string | null;
  limitations_markdown: string | null;
  sources: DraftSourceRef[];
}

export interface DraftPatch {
  expected_revision: number;
  title?: string | null;
  summary?: string | null;
  claim_text?: string | null;
  context_text?: string | null;
  verdict?: Verdict | null;
  verdict_explanation?: string | null;
  analysis_markdown?: string | null;
  limitations_markdown?: string | null;
  translation_status?: TranslationState;
}

export interface Review {
  id: string;
  fact_check_content_id: string;
  reviewer_id: string;
  decision: "comment" | "request_changes" | "mark_ready" | "approve";
  comments: string | null;
  revision_id: string | null;
  created_at: string;
  invalidated_at: string | null;
}

export interface Readiness {
  issues: string[];
}

export interface Preview {
  analysis_html: string;
  limitations_html: string;
}

export interface QueueItem {
  fact_check_id: string;
  language: Locale;
  title: string | null;
  public_slug: string | null;
  current_revision_number: number;
  updated_at: string;
}

export interface PublishPreview {
  snapshot: PublicSnapshot;
  kind: VersionKind;
  revision_number: number;
  correction_note_required: boolean;
  readiness_issues: string[];
}

export interface VersionRow {
  version_number: number;
  kind: VersionKind;
  published_at: string;
  content_checksum: string;
  checksum_valid: boolean;
}

export interface VersionDetail extends VersionRow {
  snapshot: PublicSnapshot;
}

export interface EditorialTopic {
  id: string;
  slug: string;
  name_bo: string;
  name_en: string;
  description_bo: string | null;
  description_en: string | null;
  position: number;
  is_active: boolean;
  slug_immutable: boolean;
}

export type TopicInput = Pick<EditorialTopic, "slug" | "name_bo" | "name_en"> & {
  description_bo?: string | null;
  description_en?: string | null;
  position?: number;
  is_active?: boolean;
};

export interface AuditEvent {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export type AuditSubject = "fact_check" | "fact_check_content" | "investigation";
