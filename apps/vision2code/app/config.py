"""
Configuration settings loaded from environment variables.
"""
from pathlib import Path
from pydantic_settings import BaseSettings

# Get the directory where this config file lives
APP_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application settings."""
    
    # Google OAuth 2.0
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str = "http://127.0.0.1:8000/auth/callback"
    
    # Application secrets
    secret_key: str
    
    # Database
    database_url: str = "sqlite:///./app.db"
    
    # Session settings
    session_expire_hours: int = 24 * 7  # 1 week
    
    class Config:
        env_file = APP_DIR / ".env"
        env_file_encoding = "utf-8"


def get_settings() -> Settings:
    """Get settings instance (fresh each time for dev)."""
    return Settings()
