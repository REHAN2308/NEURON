"""
NEURON Auth - Main FastAPI Application
Authentication service for NEURON Image-to-Code platform.
"""
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote
from fastapi import FastAPI, Depends, Request
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.database import init_db, get_db
from app.auth import (
    oauth,
    get_current_user,
    get_or_create_user,
    create_session,
    sign_session_id,
    verify_session_id,
    delete_session,
    COOKIE_NAME,
    COOKIE_MAX_AGE,
    get_user_from_session
)
from app.models import User

settings = get_settings()

# Get the directory where this main.py file lives
BASE_DIR = Path(__file__).resolve().parent

# Frontend URL for redirects after auth
FRONTEND_URL = "http://localhost:3000"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Initialize database on startup
    init_db()
    yield


# Create FastAPI app
app = FastAPI(
    title="NEURON Auth",
    description="Authentication service for NEURON platform",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add session middleware (required for OAuth state)
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)

# Mount static files
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# Setup Jinja2 templates
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


# ==================== PUBLIC ROUTES ====================

@app.get("/")
async def index(request: Request, db: DBSession = Depends(get_db)):
    """
    Landing page - shows login option or redirects to dashboard if authenticated.
    """
    user = get_user_from_session(request, db)
    if user:
        return RedirectResponse(url="/dashboard", status_code=302)
    
    return templates.TemplateResponse(
        "index.html",
        {"request": request}
    )


@app.get("/login")
async def login(request: Request):
    """
    Redirect to Google OAuth 2.0 authorization URL.
    """
    redirect_uri = settings.google_redirect_uri
    return await oauth.google.authorize_redirect(request, redirect_uri)


@app.get("/auth/callback")
async def auth_callback(request: Request, db: DBSession = Depends(get_db)):
    """
    Handle OAuth callback from Google.
    Exchanges code for tokens, verifies ID token, creates/finds user, sets session.
    """
    try:
        # Exchange code for tokens
        token = await oauth.google.authorize_access_token(request)
        
        # Get user info from ID token
        user_info = token.get("userinfo")
        if not user_info:
            # Fallback: fetch from userinfo endpoint
            user_info = await oauth.google.userinfo(token=token)
        
        google_id = user_info.get("sub")
        email = user_info.get("email")
        name = user_info.get("name", email.split("@")[0] if email else "User")
        avatar_url = user_info.get("picture")
        
        if not google_id or not email:
            return RedirectResponse(url=f"{FRONTEND_URL}/login?error=invalid_user_info", status_code=302)
        
        # Get or create user
        user = get_or_create_user(
            db=db,
            google_id=google_id,
            email=email,
            name=name,
            avatar_url=avatar_url
        )
        
        # Create session
        session_id = create_session(db, user)
        signed_session_id = sign_session_id(session_id)
        
        # URL encode the token to handle special characters
        encoded_token = quote(signed_session_id, safe='')
        
        # Redirect to frontend with token in URL (frontend will store it)
        redirect_url = f"{FRONTEND_URL}/auth/callback?token={encoded_token}"
        return RedirectResponse(url=redirect_url, status_code=302)
        
    except Exception as e:
        print(f"OAuth error: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=auth_failed", status_code=302)


@app.get("/logout")
async def logout(request: Request, db: DBSession = Depends(get_db)):
    """
    Clear session and redirect to frontend login page.
    """
    signed_session_id = request.cookies.get(COOKIE_NAME)
    if signed_session_id:
        session_id = verify_session_id(signed_session_id)
        if session_id:
            delete_session(db, session_id)
    
    response = RedirectResponse(url=f"{FRONTEND_URL}/login", status_code=302)
    response.delete_cookie(key=COOKIE_NAME)
    return response


# ==================== PROTECTED ROUTES ====================

@app.get("/dashboard")
async def dashboard(
    request: Request,
    db: DBSession = Depends(get_db)
):
    """
    Protected dashboard page.
    Redirects to landing page if not authenticated.
    """
    user = get_user_from_session(request, db)
    if not user:
        return RedirectResponse(url="/", status_code=302)
    
    return templates.TemplateResponse(
        "dashboard.html",
        {"request": request, "user": user}
    )


@app.get("/me")
async def get_me(request: Request, db: DBSession = Depends(get_db)):
    """
    Return current user info as JSON.
    Returns 401 if not authenticated.
    Accepts session from:
    - Authorization header: Bearer <token>
    - Cookie header: session_id=<token>
    """
    signed_session_id = None
    
    # First, try Authorization header (Bearer token)
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        signed_session_id = auth_header[7:]  # Remove "Bearer " prefix
    
    # Fallback: Try to get session from Cookie header
    if not signed_session_id:
        cookie_header = request.headers.get("cookie", "")
        for cookie in cookie_header.split(";"):
            cookie = cookie.strip()
            if cookie.startswith("session_id="):
                signed_session_id = cookie.split("=", 1)[1]
                break
    
    # Also try the standard cookie approach
    if not signed_session_id:
        signed_session_id = request.cookies.get(COOKIE_NAME)
    
    if not signed_session_id:
        return JSONResponse(content={"error": "Not authenticated"}, status_code=401)
    
    session_id = verify_session_id(signed_session_id)
    if not session_id:
        return JSONResponse(content={"error": "Invalid session"}, status_code=401)
    
    from app.models import Session
    from datetime import datetime
    
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session or session.expires_at < datetime.utcnow():
        return JSONResponse(content={"error": "Session expired"}, status_code=401)
    
    return JSONResponse(content=session.user.to_dict())


# ==================== HEALTH CHECK ====================

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "app": "Vision2Code"}
