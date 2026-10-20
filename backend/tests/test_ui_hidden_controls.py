"""Controls the editorial UI hides by role must still be refused when called directly.

The UI is never a security boundary. Each row is a request a role's screens do not offer,
sent straight to the API with a valid session and CSRF token.
"""

from __future__ import annotations

import uuid
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import (
    ArchiveVisibility,
    InvestigationAssignmentRole,
    RoleCode,
)
from tests.auth_helpers import csrf_headers, login
from tests.factories import make_document, make_investigation, make_submission, make_user
from tests.test_reviews import _create_factcheck

PASSWORD = "correct-horse-battery-staple"
REFUSED = {403, 404}


@dataclass(frozen=True)
class Attempt:
    role: RoleCode
    method: str
    path: str
    body: dict[str, Any] | None = None


def _attempts(
    *,
    submission: uuid.UUID,
    investigation: uuid.UUID,
    fact_check: uuid.UUID,
    document: uuid.UUID,
    someone: uuid.UUID,
) -> list[Attempt]:
    fc = f"/api/v1/editorial/factchecks/{fact_check}"
    lang = f"{fc}/languages/en"
    inv = f"/api/v1/investigations/{investigation}"
    reason = {"reason": "Because."}
    researcher, editor, approver, admin = (
        RoleCode.RESEARCHER,
        RoleCode.EDITOR,
        RoleCode.APPROVER,
        RoleCode.PLATFORM_ADMINISTRATOR,
    )
    return [
        # Researchers do not reveal contacts, manage topics, assign, review, approve, or publish.
        Attempt(researcher, "GET", f"/api/v1/editorial/submissions/{submission}/contact"),
        Attempt(researcher, "GET", "/api/v1/editorial/topics"),
        Attempt(
            researcher,
            "POST",
            "/api/v1/editorial/topics",
            {"slug": "x", "name_bo": "x", "name_en": "x"},
        ),
        Attempt(researcher, "PUT", f"{fc}/topics", {"topic_ids": []}),
        Attempt(researcher, "POST", f"{inv}/assignments", {"user_id": str(someone)}),
        Attempt(researcher, "POST", f"{lang}/reviews", {"comments": "Looks fine."}),
        Attempt(researcher, "POST", f"{lang}/mark-ready"),
        Attempt(researcher, "POST", f"{lang}/approve", {"expected_revision": 1}),
        Attempt(researcher, "GET", f"{lang}/publish-preview"),
        Attempt(researcher, "POST", f"{lang}/publish", {}),
        Attempt(researcher, "POST", f"{lang}/corrections", {"kind": "correction", **reason}),
        Attempt(
            researcher,
            "POST",
            f"{lang}/withdraw",
            {"public_notice": "Notice", "internal_reason": "Why"},
        ),
        Attempt(
            researcher,
            "POST",
            f"/api/v1/archive/documents/{document}/classification",
            {"visibility": "internal", **reason},
        ),
        Attempt(researcher, "GET", "/api/v1/editorial/approval-queue"),
        Attempt(
            researcher,
            "GET",
            f"/api/v1/editorial/audit?subject_type=fact_check&subject_id={fact_check}",
        ),
        Attempt(researcher, "GET", "/api/v1/admin/users"),
        # Approvers do not triage, draft, or reveal contacts.
        Attempt(approver, "GET", "/api/v1/editorial/submissions"),
        Attempt(approver, "GET", f"/api/v1/editorial/submissions/{submission}/contact"),
        Attempt(
            approver,
            "POST",
            f"/api/v1/editorial/submissions/{submission}/triage",
            {"action": "open_investigation"},
        ),
        Attempt(approver, "GET", "/api/v1/editorial/staff"),
        Attempt(
            approver,
            "POST",
            "/api/v1/editorial/topics",
            {"slug": "y", "name_bo": "y", "name_en": "y"},
        ),
        Attempt(approver, "PATCH", f"{lang}", {"expected_revision": 0, "title": "Edited"}),
        Attempt(approver, "POST", f"{lang}/submit-for-review"),
        Attempt(approver, "POST", f"{lang}/mark-ready"),
        Attempt(approver, "POST", f"{inv}/evidence", {"excerpt": "x"}),
        Attempt(
            approver,
            "POST",
            "/api/v1/admin/invites",
            {"email": "a@example.org", "role_codes": ["editor"]},
        ),
        # Editors do not approve, publish, correct, or withdraw.
        Attempt(editor, "POST", f"{lang}/approve", {"expected_revision": 1}),
        Attempt(editor, "GET", f"{lang}/publish-preview"),
        Attempt(editor, "POST", f"{lang}/publish", {}),
        Attempt(editor, "POST", f"{lang}/corrections", {"kind": "correction", **reason}),
        Attempt(
            editor,
            "POST",
            f"{lang}/withdraw",
            {"public_notice": "Notice", "internal_reason": "Why"},
        ),
        Attempt(editor, "GET", "/api/v1/admin/users"),
        Attempt(editor, "PUT", f"/api/v1/admin/users/{someone}/roles", {"role_codes": ["editor"]}),
        Attempt(editor, "POST", f"/api/v1/admin/users/{someone}/disable"),
        # A platform administrator holds no editorial role, so no editorial screen works for them.
        Attempt(admin, "GET", "/api/v1/editorial/submissions"),
        Attempt(admin, "GET", f"/api/v1/editorial/submissions/{submission}"),
        Attempt(admin, "GET", "/api/v1/investigations"),
        Attempt(admin, "GET", f"{inv}"),
        Attempt(admin, "GET", "/api/v1/editorial/factchecks"),
        Attempt(admin, "GET", f"{fc}"),
        Attempt(admin, "GET", f"{lang}/reviews"),
        Attempt(admin, "GET", "/api/v1/editorial/approval-queue"),
        Attempt(admin, "GET", "/api/v1/editorial/topics"),
        Attempt(admin, "GET", "/api/v1/editorial/staff"),
        Attempt(admin, "GET", "/api/v1/archive/documents"),
        Attempt(admin, "GET", f"/api/v1/archive/documents/{document}/grants"),
    ]


@pytest.mark.usefixtures("db_session_for_api")
async def test_hidden_controls_are_refused_by_the_api(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    users = {
        role: await make_user(db_session_for_api, roles=(role,))
        for role in (
            RoleCode.RESEARCHER,
            RoleCode.EDITOR,
            RoleCode.APPROVER,
            RoleCode.PLATFORM_ADMINISTRATOR,
        )
    }
    researcher = users[RoleCode.RESEARCHER]
    investigation = await make_investigation(
        db_session_for_api,
        owner=researcher,
        assigned=[
            (users[RoleCode.APPROVER], InvestigationAssignmentRole.CONTRIBUTOR),
        ],
    )
    submission = await make_submission(db_session_for_api)
    document = await make_document(
        db_session_for_api,
        investigation=investigation,
        visibility=ArchiveVisibility.RESTRICTED,
    )

    async with api_client_factory() as author_client:
        author_session = await login(author_client, email=researcher.email, password=PASSWORD)
        created = await _create_factcheck(author_client, author_session, investigation.id)

    attempts = _attempts(
        submission=submission.id,
        investigation=investigation.id,
        fact_check=uuid.UUID(created["id"]),
        document=document.id,
        someone=users[RoleCode.EDITOR].id,
    )

    unexpected: list[str] = []
    async with AsyncExitStack() as stack:
        sessions: dict[RoleCode, tuple[AsyncClient, dict[str, str]]] = {}
        for role, user in users.items():
            client = await stack.enter_async_context(api_client_factory())
            session = await login(client, email=user.email, password=PASSWORD)
            sessions[role] = (client, csrf_headers(session["csrf_token"]))
        for attempt in attempts:
            client, headers = sessions[attempt.role]
            response = await client.request(
                attempt.method,
                attempt.path,
                json=attempt.body,
                headers=headers,
            )
            if response.status_code not in REFUSED:
                unexpected.append(
                    f"{attempt.role.value} {attempt.method} {attempt.path}"
                    f" -> {response.status_code}"
                )

    # Controls: the same fixtures do grant access where the policy says they should, so the
    # refusals above are the policy talking and not a broken setup.
    allowed = [
        (RoleCode.RESEARCHER, f"/api/v1/editorial/factchecks/{created['id']}"),
        (RoleCode.EDITOR, f"/api/v1/editorial/factchecks/{created['id']}/languages/en/reviews"),
        (RoleCode.EDITOR, f"/api/v1/editorial/submissions/{submission.id}/contact"),
        (RoleCode.APPROVER, f"/api/v1/editorial/factchecks/{created['id']}"),
        (RoleCode.PLATFORM_ADMINISTRATOR, "/api/v1/admin/users"),
    ]
    async with AsyncExitStack() as stack:
        for role, path in allowed:
            client = await stack.enter_async_context(api_client_factory())
            await login(client, email=users[role].email, password=PASSWORD)
            response = await client.get(path)
            assert response.status_code == 200, f"{role.value} GET {path}: {response.text}"

    assert not unexpected, "Requests that were not refused:\n" + "\n".join(unexpected)
