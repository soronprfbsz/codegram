"""Tests for the dev-only admin bootstrap seed (ADR-0016, Task 12).

seed_admin must only run when settings.environment == "development"; it
upserts admin@tscorp.ai with a known bootstrap password and forces a change
on first login (must_change_password=True). It must never reset an existing
account's password on re-run.
"""
from fastapi_users.password import PasswordHelper
from sqlalchemy import func, select

from app.core.config import settings
from app.models.user import User
from app.scripts.seed_admin import seed_admin

_password_helper = PasswordHelper()


async def test_seed_admin_creates_admin_in_development(test_session, monkeypatch):
    monkeypatch.setattr(settings, "environment", "development")

    await seed_admin(test_session)

    result = await test_session.execute(
        select(User).where(User.email == "admin@tscorp.ai")
    )
    user = result.scalar_one()
    assert user.is_active is True
    assert user.is_verified is True
    assert user.must_change_password is True

    valid, _ = _password_helper.verify_and_update("admin!1", user.hashed_password)
    assert valid is True

    from app.repositories.rbac import RbacRepository

    rbac = RbacRepository(test_session)
    admin_role = await rbac.role_by_name("admin")
    assert user.role_id == admin_role.id


async def test_seed_admin_is_idempotent(test_session, monkeypatch):
    monkeypatch.setattr(settings, "environment", "development")

    await seed_admin(test_session)
    await seed_admin(test_session)

    result = await test_session.execute(
        select(func.count())
        .select_from(User)
        .where(User.email == "admin@tscorp.ai")
    )
    assert result.scalar_one() == 1


async def test_seed_admin_does_not_reset_existing_password(test_session, monkeypatch):
    monkeypatch.setattr(settings, "environment", "development")

    await seed_admin(test_session)
    result = await test_session.execute(
        select(User).where(User.email == "admin@tscorp.ai")
    )
    user = result.scalar_one()
    original_hash = user.hashed_password
    user.must_change_password = False
    await test_session.flush()

    await seed_admin(test_session)

    result = await test_session.execute(
        select(User).where(User.email == "admin@tscorp.ai")
    )
    user_after = result.scalar_one()
    assert user_after.hashed_password == original_hash
    assert user_after.must_change_password is False


async def test_seed_admin_noop_outside_development(test_session, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")

    await seed_admin(test_session)

    result = await test_session.execute(
        select(func.count())
        .select_from(User)
        .where(User.email == "admin@tscorp.ai")
    )
    assert result.scalar_one() == 0
