import os
import secrets
from pathlib import Path
from pydantic_settings import BaseSettings

def get_or_create_admin_key() -> str:
    """Retrieves admin key from environment, or generates and stores a secure key if missing."""
    env_key = os.getenv("ADMIN_API_KEY", "").strip()
    if env_key and env_key != "admin-master-secret-key":
        return env_key
    
    # Check data directory for persisted admin key
    key_file = Path("./data/admin_api_key.txt")
    try:
        if key_file.exists():
            saved_key = key_file.read_text(encoding="utf-8").strip()
            if saved_key:
                return saved_key
        
        # Generate new cryptographically secure admin key
        new_key = f"admin_sec_{secrets.token_hex(24)}"
        key_file.parent.mkdir(parents=True, exist_ok=True)
        key_file.write_text(new_key, encoding="utf-8")
        return new_key
    except Exception:
        # Fallback to in-memory secure random key for session
        return f"admin_sec_{secrets.token_hex(24)}"

class Settings(BaseSettings):
    PROJECT_NAME: str = "LM Studio API Gateway"
    API_V1_PREFIX: str = "/api/v1"
    
    # LM Studio default URL
    LM_STUDIO_URL: str = os.getenv("LM_STUDIO_URL", "http://127.0.0.1:1234/v1")
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./data/gateway.db")
    
    # Admin security - dynamically loaded/generated without static hardcoded secrets
    ADMIN_API_KEY: str = get_or_create_admin_key()
    
    # Timeout for LM Studio calls in seconds
    REQUEST_TIMEOUT: float = float(os.getenv("REQUEST_TIMEOUT", "180.0"))
    
    # Resource & Concurrency Controls
    MAX_CONCURRENT_INFERENCES: int = int(os.getenv("MAX_CONCURRENT_INFERENCES", "2"))
    DEFAULT_RATE_LIMIT_PER_MIN: int = int(os.getenv("DEFAULT_RATE_LIMIT_PER_MIN", "60"))
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

