"""Account management business logic: list accounts, change role, reset
password (ADR-0016, Task 5).

The service does not commit; the request scope (get_session) commits the unit
of work. Password hashing uses fastapi-users' PasswordHelper so a reset
password verifies through the normal login flow (same hasher the UserManager
uses to authenticate).
"""
import secrets
import string
import uuid

from fastapi_users.password import PasswordHelper
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.rbac import RbacRepository
from app.repositories.user import UserRepository
from app.schemas.account import AccountRead

_MIN_PASSWORD_LENGTH = 8
_TEMP_PASSWORD_LENGTH = 12
# ascii letters + digits, minus visually confusable characters (O0oIl1).
_TEMP_PASSWORD_ALPHABET = "".join(
    c for c in string.ascii_letters + string.digits if c not in "O0oIl1"
)

_password_helper = PasswordHelper()


class AccountNotFoundError(Exception):
    """No user exists with this id."""


class RoleNotFoundError(Exception):
    """No role exists with this name."""


class LastAdminError(Exception):
    """Changing this user's role away from admin would leave zero admins."""


class WrongCurrentPasswordError(Exception):
    """The current password is missing or does not match (voluntary change)."""


class PasswordTooShortError(Exception):
    """The new password is shorter than the minimum length."""


def _generate_temp_password() -> str:
    """A random temp password: 12 chars from a confusable-free alphabet."""
    return "".join(
        secrets.choice(_TEMP_PASSWORD_ALPHABET)
        for _ in range(_TEMP_PASSWORD_LENGTH)
    )


class AccountService:
    """Admin-facing account operations: list, role change, password reset."""

    def __init__(self, session: AsyncSession) -> None:
        """Build the service over a session + RBAC/user repos."""
        self.session = session
        self.rbac = RbacRepository(session)
        self.users = UserRepository(session)

    async def list_accounts(self) -> list[AccountRead]:
        """List every account with its resolved role name (None if unset)."""
        users = await self.users.list_all()
        out: list[AccountRead] = []
        for user in users:
            role_name = await self._role_name(user.role_id)
            out.append(AccountRead(id=user.id, email=user.email, role_name=role_name))
        return out

    async def change_role(self, account_id: uuid.UUID, role_name: str) -> AccountRead:
        """Assign a role to an account, guarding against demoting the last admin."""
        user = await self.users.get_by_id(account_id)
        if user is None:
            raise AccountNotFoundError(account_id)
        new_role = await self.rbac.role_by_name(role_name)
        if new_role is None:
            raise RoleNotFoundError(role_name)

        current_role_name = await self._role_name(user.role_id)
        if current_role_name == "admin" and new_role.name != "admin":
            if await self.rbac.count_admins() <= 1:
                raise LastAdminError(account_id)

        await self.users.set_role(user, new_role.id)
        return AccountRead(id=user.id, email=user.email, role_name=new_role.name)

    async def reset_password(self, account_id: uuid.UUID) -> str:
        """Reset an account's password to a random temp value (forces change).

        Returns the plaintext temp password once (not recoverable after)."""
        user = await self.users.get_by_id(account_id)
        if user is None:
            raise AccountNotFoundError(account_id)
        temp_password = _generate_temp_password()
        hashed = _password_helper.hash(temp_password)
        await self.users.set_password_hash(user, hashed, must_change=True)
        return temp_password

    async def change_own_password(
        self, user: User, current_password: str | None, new_password: str
    ) -> None:
        """Change the caller's own password.

        If the caller is in a forced must-change-password state, the current
        password is not checked. Otherwise current_password is required and
        must verify against the stored hash."""
        if len(new_password) < _MIN_PASSWORD_LENGTH:
            raise PasswordTooShortError()
        if not user.must_change_password:
            if not current_password:
                raise WrongCurrentPasswordError()
            valid, _ = _password_helper.verify_and_update(
                current_password, user.hashed_password
            )
            if not valid:
                raise WrongCurrentPasswordError()
        hashed = _password_helper.hash(new_password)
        await self.users.set_password_hash(user, hashed, must_change=False)

    async def _role_name(self, role_id: uuid.UUID | None) -> str | None:
        """Resolve a role id to its name, or None if unset/missing."""
        if role_id is None:
            return None
        role = await self.rbac.role_by_id(role_id)
        return role.name if role is not None else None
