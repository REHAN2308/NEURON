"""
OAuth logic, session helpers, and authentication dependencies.
"""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from authlib.integrations.starlette_client import OAuth
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession
from itsdangerous import URLSafeTimedSerializer, BadSignature

from app.config import get_settings
from app.database import get_db
from app.models import User, Session

settings = get_settings()

# Cookie settings
COOKIE_NAME = "session_id"
COOKIE_MAX_AGE = settings.session_expire_hours * 3600

# Initialize OAuth
oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": "openid email profile"
    }
)

# Serializer for signing cookies
serializer = URLSafeTimedSerializer(settings.secret_key)


def create_session(db: DBSession, user: User) -> str:
    """
    Create a new session for the user.
    Returns the session ID.
    """
    session_id = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=settings.session_expire_hours)
    
    session = Session(
        id=session_id,
        user_id=user.id,
        expires_at=expires_at
    )
    db.add(session)
    db.commit()
    
    return session_id


def sign_session_id(session_id: str) -> str:
    """Sign the session ID for secure cookie storage."""
    return serializer.dumps(session_id)


def verify_session_id(signed_value: str) -> Optional[str]:
    """Verify and extract the session ID from signed cookie value."""
    try:
        return serializer.loads(signed_value, max_age=COOKIE_MAX_AGE)
    except BadSignature:
        return None


def get_session_from_cookie(request: Request, db: DBSession) -> Optional[Session]:
    """
    Get session from cookie.
    Returns None if no valid session exists.
    """
    signed_session_id = request.cookies.get(COOKIE_NAME)
    if not signed_session_id:
        return None
    
    session_id = verify_session_id(signed_session_id)
    if not session_id:
        return None
    
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        return None
    
    # Check if session is expired
    if session.expires_at < datetime.utcnow():
        db.delete(session)
        db.commit()
        return None
    
    return session


def get_user_from_session(request: Request, db: DBSession) -> Optional[User]:
    """
    Get user from session cookie.
    Returns None if no valid session exists.
    """
    session = get_session_from_cookie(request, db)
    if not session:
        return None
    return session.user


def delete_session(db: DBSession, session_id: str) -> None:
    """Delete a session from the database."""
    session = db.query(Session).filter(Session.id == session_id).first()
    if session:
        db.delete(session)
        db.commit()


def get_or_create_user(
    db: DBSession,
    google_id: str,
    email: str,
    name: str,
    avatar_url: Optional[str] = None
) -> User:
    """
    Get existing user or create a new one.
    """
    user = db.query(User).filter(User.google_id == google_id).first()
    
    if user:
        # Update user info if changed
        user.email = email
        user.name = name
        user.avatar_url = avatar_url
        db.commit()
        db.refresh(user)
        return user
    
    # Create new user
    user = User(
        google_id=google_id,
        email=email,
        name=name,
        avatar_url=avatar_url
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# Dependency for protected routes
async def get_current_user(
    request: Request,
    db: DBSession = Depends(get_db)
) -> User:
    """
    Dependency to get the current authenticated user.
    Raises HTTPException(401) if not authenticated.
    """
    user = get_user_from_session(request, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    return user


async def get_optional_user(
    request: Request,
    db: DBSession = Depends(get_db)
) -> Optional[User]:
    """
    Dependency to get the current user if authenticated.
    Returns None if not authenticated.
    """
    return get_user_from_session(request, db)
