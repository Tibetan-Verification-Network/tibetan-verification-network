"""Representative inserts, privacy boundaries, and constraint behavior."""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.enums import ArchiveVisibility, LanguageCode, RoleCode, WorkflowStatus
from app.models.archive import ArchiveDocument
from app.models.identity import Role, User, UserRole
from app.models.intake import Submission, SubmissionContact
from app.models.publication import FactCheck, FactCheckContent

pytestmark = pytest.mark.usefixtures("db_session")


async def test_submission_contact_is_stored_separately(db_session: AsyncSession) -> None:
    submission = Submission(
        claim_text="A public claim",
        workflow_status=WorkflowStatus.INBOX,
    )
    submission.contact = SubmissionContact(
        contact_email="submitter@example.org",
        privacy_notice_acknowledged=True,
    )
    db_session.add(submission)
    await db_session.flush()

    loaded = await db_session.get(Submission, submission.id)
    assert loaded is not None
    assert loaded.contact is not None
    assert loaded.contact.contact_email == "submitter@example.org"
    assert loaded.claim_text == "A public claim"


async def test_fact_check_supports_independent_language_rows(db_session: AsyncSession) -> None:
    fact_check = FactCheck(workflow_status=WorkflowStatus.DRAFTING)
    fact_check.contents = [
        FactCheckContent(language=LanguageCode.EN, title="English title"),
        FactCheckContent(language=LanguageCode.BO, title="བོད་ཡིག"),
    ]
    db_session.add(fact_check)
    await db_session.flush()

    rows = (
        (
            await db_session.execute(
                select(FactCheckContent.language).where(
                    FactCheckContent.fact_check_id == fact_check.id
                )
            )
        )
        .scalars()
        .all()
    )
    assert set(rows) == {LanguageCode.EN, LanguageCode.BO}


async def test_duplicate_user_role_assignment_is_rejected(db_session: AsyncSession) -> None:
    role = (await db_session.execute(select(Role).where(Role.code == RoleCode.EDITOR))).scalar_one()
    user = User(
        email="Editor@Example.org",
        email_normalized="editor@example.org",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add_all(
        [
            UserRole(user_id=user.id, role_id=role.id),
            UserRole(user_id=user.id, role_id=role.id),
        ]
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_archive_document_defaults_to_internal_visibility(
    db_session: AsyncSession,
) -> None:
    document = ArchiveDocument(title="Restricted notes")
    db_session.add(document)
    await db_session.flush()
    assert document.visibility == ArchiveVisibility.INTERNAL


async def test_failed_transaction_rolls_back_related_rows(test_engine: AsyncEngine) -> None:
    from app.db.session import create_session_factory, session_scope

    factory = create_session_factory(test_engine)
    user_id = uuid.uuid4()
    with pytest.raises(IntegrityError):
        async with session_scope(factory) as session:
            session.add(
                User(
                    id=user_id,
                    email="dup@example.org",
                    email_normalized="dup@example.org",
                    is_active=True,
                )
            )
            session.add(
                User(
                    email="Dup@Example.org",
                    email_normalized="dup@example.org",
                    is_active=True,
                )
            )

    async with test_engine.connect() as connection:
        result = await connection.execute(select(User.id).where(User.id == user_id))
        assert result.first() is None
