"""Auth routes: fastapi-users register/login/logout/users + a protected sample."""
from fastapi import APIRouter, Depends

from app.core.users import auth_backend, current_active_user, fastapi_users
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate

router = APIRouter()

# POST /auth/register  -> 201 + UserRead
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
)

# POST /auth/jwt/login -> 204 + Set-Cookie ; POST /auth/jwt/logout -> 204 (clears cookie)
router.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/auth/jwt",
    tags=["auth"],
)

# GET/PATCH /users/me -> 200 + UserRead (requires auth)
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
)

# Sample protected endpoint: 401 without a valid auth cookie, 200 with one.
protected_router = APIRouter(prefix="/protected", tags=["protected"])


@protected_router.get("/ping")
async def protected_ping(user: User = Depends(current_active_user)) -> dict[str, str]:
    """Return the authenticated user's email; rejects unauthenticated callers."""
    return {"email": user.email}


router.include_router(protected_router)
