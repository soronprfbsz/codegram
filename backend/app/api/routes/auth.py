"""Auth routes: fastapi-users register/login/logout/users + a protected sample."""
from fastapi import APIRouter, Depends
from fastapi.routing import APIRoute

from app.core.permissions import require_password_ok
from app.core.users import auth_backend, fastapi_users
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

# fastapi-users' router bundles GET/PATCH /me + GET/PATCH/DELETE /{id} in one
# APIRouter. Per ADR-0016, a must_change_password=True caller may only read
# their own account, never mutate it (or anyone else's) — but GET /me must
# stay reachable so the frontend's force-change screen can keep working.
# Split the generated routes into an ungated GET /me and everything else
# (gated by require_password_ok) instead of mounting the router as one unit.
_users_router = fastapi_users.get_users_router(UserRead, UserUpdate)
_get_me_routes = APIRouter()
_get_me_routes.routes = [
    route
    for route in _users_router.routes
    if isinstance(route, APIRoute) and route.path == "/me" and "GET" in route.methods
]
_mutating_routes = APIRouter()
_mutating_routes.routes = [
    route for route in _users_router.routes if route not in _get_me_routes.routes
]

router.include_router(_get_me_routes, prefix="/users", tags=["users"])
router.include_router(
    _mutating_routes,
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(require_password_ok)],
)

# Sample protected endpoint: 401 without a valid auth cookie, 200 with one.
protected_router = APIRouter(prefix="/protected", tags=["protected"])


@protected_router.get("/ping")
async def protected_ping(user: User = Depends(require_password_ok)) -> dict[str, str]:
    """Return the authenticated user's email; rejects unauthenticated callers."""
    return {"email": user.email}


router.include_router(protected_router)
