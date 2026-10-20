"""Derive fact-check and investigation workflow status from language rows."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.enums import LanguageEditorialStatus, WorkflowStatus
from app.models.publication import FactCheck
from app.models.research import Investigation


def derive_workflow_status_from_contents(
    contents: list,
) -> WorkflowStatus:
    if any(getattr(row, "live_version_id", None) is not None for row in contents):
        return WorkflowStatus.PUBLISHED
    statuses = {row.editorial_status for row in contents}
    if LanguageEditorialStatus.APPROVED in statuses:
        return WorkflowStatus.APPROVED
    if statuses.intersection(
        {LanguageEditorialStatus.IN_REVIEW, LanguageEditorialStatus.READY_FOR_APPROVAL}
    ):
        return WorkflowStatus.IN_REVIEW
    if LanguageEditorialStatus.CHANGES_REQUESTED in statuses:
        return WorkflowStatus.CHANGES_REQUESTED
    return WorkflowStatus.DRAFTING


async def recompute_workflow_rollup(
    session: AsyncSession,
    *,
    fact_check: FactCheck | None = None,
    investigation: Investigation | None = None,
) -> None:
    """Update derived workflow_status on fact check and linked investigation."""
    if fact_check is not None:
        await session.refresh(fact_check, attribute_names=["contents", "investigation_id"])
        investigation = fact_check.investigation or investigation

    if fact_check is None:
        return

    if investigation is not None:
        await session.refresh(investigation, attribute_names=["workflow_status", "hold_from_status"])
        if investigation.workflow_status in {WorkflowStatus.ON_HOLD, WorkflowStatus.REJECTED}:
            fact_check.workflow_status = investigation.workflow_status
            return

    derived = derive_workflow_status_from_contents(list(fact_check.contents))
    fact_check.workflow_status = derived

    if investigation is None:
        return

    if investigation.workflow_status in {WorkflowStatus.ON_HOLD, WorkflowStatus.REJECTED}:
        return

    editorial_phase = derived not in {WorkflowStatus.DRAFTING} or any(
        row.editorial_status != LanguageEditorialStatus.DRAFT for row in fact_check.contents
    )
    if editorial_phase or investigation.workflow_status in {
        WorkflowStatus.DRAFTING,
        WorkflowStatus.IN_REVIEW,
        WorkflowStatus.CHANGES_REQUESTED,
        WorkflowStatus.APPROVED,
        WorkflowStatus.PUBLISHED,
    }:
        investigation.workflow_status = derived


async def load_fact_check_for_rollup(
    session: AsyncSession,
    fact_check_id,
) -> FactCheck | None:
    from sqlalchemy import select

    result = await session.execute(
        select(FactCheck)
        .where(FactCheck.id == fact_check_id)
        .options(
            selectinload(FactCheck.contents),
            selectinload(FactCheck.investigation),
        )
    )
    return result.scalar_one_or_none()
