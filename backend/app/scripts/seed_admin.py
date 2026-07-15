"""Dev-only admin bootstrap seed (ADR-0016, Task 12).

Creates a known admin@tscorp.ai / admin!1 account so a fresh dev environment
has an initial admin to log in with. must_change_password=True forces the
bootstrap password to be replaced on first login. This is deliberately NOT an
Alembic migration (ADR-0016): migrations run in production too, and a
well-known password must never exist there. seed_admin gates on
settings.environment == "development" and is a no-op otherwise.

Idempotent: if admin@tscorp.ai already exists, it is left as-is (password is
never reset on re-run).

Fail-closed: settings.environment defaults to "development", so gating on
that alone would seed the known-password admin if ENVIRONMENT is ever left
unset. The seed additionally requires settings.allow_admin_seed (env var
ALLOW_ADMIN_SEED) to be explicitly set truthy. Run it in dev with:
    ALLOW_ADMIN_SEED=1 python -m app.scripts.seed_admin
"""
import asyncio
import uuid

from fastapi_users.password import PasswordHelper
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import async_session_maker
from app.models.user import User
from app.repositories.rbac import RbacRepository
from app.repositories.user import UserRepository

ADMIN_EMAIL = "admin@tscorp.ai"
ADMIN_PASSWORD = "admin!1"

_password_helper = PasswordHelper()


async def seed_admin(session: AsyncSession) -> None:
    """Upsert the dev-only bootstrap admin account.

    No-op unless environment is "development" AND allow_admin_seed is
    explicitly set (fail-closed: see module docstring)."""
    if settings.environment != "development" or not settings.allow_admin_seed:
        return

    rbac = RbacRepository(session)
    await rbac.ensure_seed()
    admin_role = await rbac.role_by_name("admin")

    users = UserRepository(session)
    if await users.get_by_email(ADMIN_EMAIL) is not None:
        return

    session.add(
        User(
            id=uuid.uuid4(),
            email=ADMIN_EMAIL,
            hashed_password=_password_helper.hash(ADMIN_PASSWORD),
            is_active=True,
            is_superuser=False,
            is_verified=True,
            must_change_password=True,
            role_id=admin_role.id,
        )
    )
    await session.flush()


async def main() -> None:
    """Entrypoint for `python -m app.scripts.seed_admin` in the dev container."""
    async with async_session_maker() as session:
        await seed_admin(session)
        await session.commit()


if __name__ == "__main__":
    asyncio.run(main())
