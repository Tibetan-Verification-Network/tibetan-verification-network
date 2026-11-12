"""One-time backfill of selected_approver_id on in-flight mark-ready reviews."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.policy import is_approver
from app.db.enums import LanguageEditorialStatus, ReviewDecision
from app.db.session import create_engine, create_session_factory, session_scope
from app.models.publication import FactCheck, FactCheckContent, FactCheckContentRevision, Review
from app.services.intake import _editorial_staff_user
from app.workflow.guards import authors_of


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mapping",
        required=True,
        type=Path,
        help='JSON file: {"entries": [{"revision_id": "uuid", "approver_id": "uuid"}]}',
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. Default is dry-run reporting only.",
    )
    return parser.parse_args()


async def _run(mapping_path: Path, *, apply: bool) -> int:
    payload = json.loads(mapping_path.read_text(encoding="utf-8"))
    entries = payload.get("entries")
    if not isinstance(entries, list):
        print("mapping.entries must be a list", file=sys.stderr)
        return 1

    settings = get_settings()
    engine = create_engine(settings.database_url.get_secret_value())
    factory = create_session_factory(engine)
    try:
        async with session_scope(factory) as session:
            report: list[str] = []
            touched_revision_ids: set[uuid.UUID] = set()

            for raw in entries:
                try:
                    revision_id = uuid.UUID(str(raw["revision_id"]))
                    approver_id = uuid.UUID(str(raw["approver_id"]))
                except (KeyError, TypeError, ValueError) as exc:
                    report.append(f"SKIP invalid entry: {raw!r} ({exc})")
                    continue

                revision = await session.get(FactCheckContentRevision, revision_id)
                if revision is None:
                    report.append(f"SKIP unknown revision {revision_id}")
                    continue

                content = await session.scalar(
                    select(FactCheckContent)
                    .where(FactCheckContent.id == revision.content_id)
                    .options(selectinload(FactCheckContent.fact_check).selectinload(FactCheck.investigation))
                )
                if content is None:
                    report.append(f"SKIP content missing for revision {revision_id}")
                    continue

                if content.editorial_status not in {
                    LanguageEditorialStatus.READY_FOR_APPROVAL,
                    LanguageEditorialStatus.APPROVED,
                }:
                    report.append(
                        f"SKIP revision {revision_id}: status {content.editorial_status.value}"
                    )
                    continue

                review = await session.scalar(
                    select(Review).where(
                        Review.fact_check_content_id == content.id,
                        Review.revision_id == revision_id,
                        Review.decision == ReviewDecision.MARK_READY,
                        Review.invalidated_at.is_(None),
                    )
                )
                if review is None:
                    report.append(f"SKIP revision {revision_id}: no active mark-ready review")
                    continue

                approver = await _editorial_staff_user(session, approver_id)
                if approver is None or not is_approver(approver):
                    report.append(f"SKIP revision {revision_id}: invalid approver {approver_id}")
                    continue
                if approver.id == review.reviewer_id:
                    report.append(
                        f"SKIP revision {revision_id}: approver matches marking editor"
                    )
                    continue
                author_ids = await authors_of(session, content)
                if approver.id in author_ids:
                    report.append(f"SKIP revision {revision_id}: approver is cycle author")
                    continue

                if review.selected_approver_id == approver_id:
                    report.append(f"OK revision {revision_id}: already {approver_id}")
                    touched_revision_ids.add(revision_id)
                    continue

                report.append(
                    f"{'APPLY' if apply else 'PLAN'} revision {revision_id}: "
                    f"marking_editor={review.reviewer_id} approver={approver_id}"
                )
                if apply:
                    review.selected_approver_id = approver_id
                touched_revision_ids.add(revision_id)

            in_flight = (
                await session.execute(
                    select(Review, FactCheckContentRevision.id)
                    .join(
                        FactCheckContent,
                        Review.fact_check_content_id == FactCheckContent.id,
                    )
                    .join(
                        FactCheckContentRevision,
                        FactCheckContentRevision.id == Review.revision_id,
                    )
                    .where(
                        Review.decision == ReviewDecision.MARK_READY,
                        Review.invalidated_at.is_(None),
                        FactCheckContent.editorial_status.in_(
                            (
                                LanguageEditorialStatus.READY_FOR_APPROVAL,
                                LanguageEditorialStatus.APPROVED,
                            )
                        ),
                    )
                )
            ).all()
            missing = [
                row[1]
                for row in in_flight
                if row[0].selected_approver_id is None and row[1] not in touched_revision_ids
            ]
            if missing:
                report.append(
                    f"WARNING {len(missing)} in-flight revision(s) still lack selected_approver_id"
                )

            for line in report:
                print(line)

            if apply:
                await session.commit()
                print(f"Applied {len(touched_revision_ids)} designation(s).")
            else:
                print("Dry run only; pass --apply to write.")
            return 0 if not missing or apply else 1
    finally:
        await engine.dispose()


def main() -> None:
    args = _parse_args()
    raise SystemExit(asyncio.run(_run(args.mapping, apply=args.apply)))


if __name__ == "__main__":
    main()
