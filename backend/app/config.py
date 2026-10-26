import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "LM Studio API Gateway"
    API_V1_PREFIX: str = "/api/v1"
    
    # LM Studio default URL (can be host.docker.internal:1234/v1 in Docker or localhost:1234/v1 locally)
    LM_STUDIO_URL: str = os.getenv("LM_STUDIO_URL", "http://127.0.0.1:1234/v1")
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./data/gateway.db")
    
    # Admin security
    ADMIN_API_KEY: str = os.getenv("ADMIN_API_KEY", "admin-master-secret-key")
    
    # Timeout for LM Studio calls in seconds
    REQUEST_TIMEOUT: float = float(os.getenv("REQUEST_TIMEOUT", "180.0"))
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
