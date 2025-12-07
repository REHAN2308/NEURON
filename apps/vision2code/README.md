# Vision2Code

A production-ready FastAPI web application with Google OAuth 2.0 authentication.  
Base template for an image-to-code SaaS application.

## Features

- 🔐 **Google OAuth 2.0** authentication
- 🗄️ **SQLite + SQLAlchemy** for persistence
- 🍪 **Secure session management** with HttpOnly cookies
- 🎨 **Monochrome design** - clean, modern, geometric
- 📱 **Responsive** - works on desktop and mobile
- 🚀 **FastAPI** with Jinja2 templates

## Project Structure

```
vision2code/
├── app/
│   ├── main.py          # FastAPI application & routes
│   ├── auth.py          # OAuth logic, session helpers
│   ├── models.py        # SQLAlchemy models
│   ├── database.py      # Database configuration
│   ├── config.py        # Settings from environment
│   ├── templates/       # Jinja2 HTML templates
│   │   ├── base.html
│   │   ├── index.html
│   │   └── dashboard.html
│   └── static/
│       └── css/
│           └── style.css
├── requirements.txt
├── .env.example
└── README.md
```

## Prerequisites

- Python 3.13+
- A Google Cloud project with OAuth 2.0 credentials

## Installation

1. **Clone the repository** and navigate to the project:
   ```bash
   cd apps/vision2code
   ```

2. **Create a virtual environment**:
   ```bash
   python -m venv venv
   
   # Windows
   venv\Scripts\activate
   
   # macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

5. **Configure environment variables** (see below)

## Google OAuth Setup (Allow Any User to Sign Up)

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "Vision2Code")
3. Select your new project

### Step 2: Configure OAuth Consent Screen (IMPORTANT!)
1. Navigate to **APIs & Services** → **OAuth consent screen**
2. Select **External** (allows any Google user to sign up)
3. Click **Create**
4. Fill in required fields:
   - **App name**: Vision2Code
   - **User support email**: your-email@gmail.com
   - **Developer contact email**: your-email@gmail.com
5. Click **Save and Continue**
6. **Scopes**: Click "Add or Remove Scopes"
   - Add: `email`, `profile`, `openid`
   - Click **Update** then **Save and Continue**
7. **Test users**: Skip for now (not needed for published apps)
8. Click **Back to Dashboard**

### Step 3: Publish the App (For Public Access)
1. On OAuth consent screen, click **Publish App**
2. Confirm publishing
3. Status changes from "Testing" to "In Production"
   - **Testing mode**: Only added test users can log in
   - **Production mode**: ANY Google user can log in

### Step 4: Create OAuth Credentials
1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Name it (e.g., "Vision2Code Web")
5. Add **Authorized redirect URIs**:
   - For local development: `http://127.0.0.1:8000/auth/callback`
   - For production: `https://yourdomain.com/auth/callback`
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

### Environment Variables

Update your `.env` file with:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/auth/callback
SECRET_KEY=generate-a-secure-random-string
```

Generate a secure secret key:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Running the Application

### Development

```bash
uvicorn app.main:app --reload
```

The application will be available at `http://127.0.0.1:8000`

### Production

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Routes

| Route | Method | Description | Auth |
|-------|--------|-------------|------|
| `/` | GET | Landing page | Public |
| `/login` | GET | Redirects to Google OAuth | Public |
| `/auth/callback` | GET | OAuth callback handler | Public |
| `/dashboard` | GET | User dashboard | Protected |
| `/me` | GET | Returns user JSON | Protected |
| `/logout` | GET | Clears session | Protected |
| `/health` | GET | Health check | Public |

## Database

The application uses SQLite by default (`app.db` in the project root).  
Tables are created automatically on first startup.

### Models

- **User**: Google user data (id, google_id, email, name, avatar_url, created_at)
- **Session**: Server-side sessions (id, user_id, created_at, expires_at)

## Security Notes

- Sessions are stored server-side with signed HttpOnly cookies
- Cookies use `SameSite=Lax` and are not marked secure for local dev
- For production, enable `secure=True` for cookies and use HTTPS
- Never commit your `.env` file to version control

## Extending the Application

To add new protected routes, use the `get_current_user` dependency:

```python
from app.auth import get_current_user
from app.models import User

@app.get("/projects")
async def projects(user: User = Depends(get_current_user)):
    return {"user_id": user.id, "projects": []}
```

## License

MIT
