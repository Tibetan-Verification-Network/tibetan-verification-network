"""SQL scoping helpers must filter in the database layer."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.policy import scope_archive_documents, scope_investigations
from app.db.enums import ArchiveVisibility, InvestigationAssignmentRole, RoleCode
from app.models.archive import ArchiveDocument
from app.models.research import Investigation
from tests.factories import make_document, make_investigation, make_user

pytestmark = pytest.mark.usefixtures("db_session")


async def test_scope_investigations_hides_unassigned_rows(db_session: AsyncSession) -> None:
    researcher = await make_user(db_session, roles=(RoleCode.RESEARCHER,))
    owner = await make_user(db_session, email="owner@example.org", roles=(RoleCode.RESEARCHER,))
    visible = await make_investigation(
        db_session,
        owner=owner,
        assigned=[(researcher, InvestigationAssignmentRole.CONTRIBUTOR)],
    )
    await make_investigation(db_session, owner=owner)

    assert visible.id is not None
    stmt = scope_investigations(select(func.count()).select_from(Investigation), researcher)
    count = (await db_session.execute(stmt)).scalar_one()
    assert count == 1


async def test_scope_archive_documents_hides_restricted_without_grant(
    db_session: AsyncSession,
) -> None:
    researcher = await make_user(db_session, roles=(RoleCode.RESEARCHER,))
    owner = await make_user(db_session, email="owner@example.org", roles=(RoleCode.RESEARCHER,))
    investigation = await make_investigation(
        db_session,
        owner=owner,
        assigned=[(researcher, InvestigationAssignmentRole.CONTRIBUTOR)],
    )
    await make_document(
        db_session,
        investigation=investigation,
        visibility=ArchiveVisibility.INTERNAL,
    )
    await make_document(
        db_session,
        investigation=investigation,
        visibility=ArchiveVisibility.RESTRICTED,
    )

    stmt = scope_archive_documents(select(func.count()).select_from(ArchiveDocument), researcher)
    count = (await db_session.execute(stmt)).scalar_one()
    assert count == 1
