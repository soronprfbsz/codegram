"""Public admin-contact list (ADR-0016, Task 10).

Unauthenticated by design: the login screen's "비밀번호 초기화" guidance needs
to show who to contact before the user has a session. Returns every admin's
email, nothing else.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.repositories.rbac import RbacRepository
from app.schemas.admin_contact import AdminContact

router = APIRouter(tags=["admins"])


@router.get("/admins", response_model=list[AdminContact])
async def list_admins(
    session: AsyncSession = Depends(get_session),
) -> list[AdminContact]:
    """List every admin's email (public; no auth dependency)."""
    repo = RbacRepository(session)
    emails = await repo.list_admin_emails()
    return [AdminContact(email=email) for email in emails]
