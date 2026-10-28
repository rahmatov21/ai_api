import os
import secrets
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models import Endpoint, ApiKey, SystemSetting
from app.services.auth import hash_key
from app.routers import admin, public_api

def seed_initial_data():
    """Seeds sample endpoints and a secure random initial API key on first run."""
    db: Session = SessionLocal()
    try:
        # Check if endpoints exist
        if db.query(Endpoint).count() == 0:
            demo1 = Endpoint(
                name="General AI Assistant",
                slug="general-assistant",
                description="Fast multi-purpose conversational AI assistant",
                is_active=True,
                auth_required=True, # Auth required by default for security
                model_name="",
                system_prompt="You are an intelligent, helpful, and concise AI assistant.",
                temperature=0.7,
                top_p=0.95,
                max_tokens=2048,
                stream_allowed=True,
                rate_limit_per_min=60
            )
            demo2 = Endpoint(
                name="Code & Debugging Expert",
                slug="code-expert",
                description="Optimized for code generation, bug fixing, and architecture review",
                is_active=True,
                auth_required=True,
                model_name="",
                system_prompt="You are a principal software engineer. Provide idiomatic, clean, robust code with clear explanations.",
                temperature=0.2,
                top_p=0.9,
                max_tokens=4096,
                stream_allowed=True,
                rate_limit_per_min=60
            )
            db.add(demo1)
            db.add(demo2)

        # Check if API keys exist
        if db.query(ApiKey).count() == 0:
            # Generate a secure, unique random key instead of hardcoded demo credential
            random_part = secrets.token_hex(20)
            initial_raw_key = f"ak_live_{random_part}"
            key_record = ApiKey(
                name="Initial Development Key",
                key_hash=hash_key(initial_raw_key),
                key_prefix=initial_raw_key[:12] + "...",
                raw_key=None, # Never persist plaintext secret
                allowed_slugs="*",
                is_active=True
            )
            db.add(key_record)
            
            # Save initial key to local file only so operator can retrieve it
            key_file = Path("./data/initial_dev_key.txt")
            key_file.parent.mkdir(parents=True, exist_ok=True)
            key_file.write_text(initial_raw_key, encoding="utf-8")
            print(f"[SECURITY] Generated initial client API key saved to {key_file}")

        # Ensure LM Studio URL setting
        lm_url_setting = db.query(SystemSetting).filter(SystemSetting.key == "lm_studio_url").first()
        if not lm_url_setting:
            db.add(SystemSetting(key="lm_studio_url", value=settings.LM_STUDIO_URL))

        db.commit()
    except Exception as e:
        print(f"Error seeding initial data: {e}")
        db.rollback()
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables & migrate if needed
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        try:
            # Scrub any existing plaintext keys from legacy databases
            conn.execute(text("UPDATE api_keys SET raw_key = NULL WHERE raw_key IS NOT NULL"))
            conn.commit()

            ep_result = conn.execute(text("PRAGMA table_info(endpoints)")).fetchall()
            ep_columns = [row[1] for row in ep_result]
            if "enable_reasoning" not in ep_columns:
                conn.execute(text("ALTER TABLE endpoints ADD COLUMN enable_reasoning BOOLEAN DEFAULT 1"))
                conn.commit()
            if "rate_limit_per_min" not in ep_columns:
                conn.execute(text("ALTER TABLE endpoints ADD COLUMN rate_limit_per_min INTEGER DEFAULT 60"))
                conn.commit()
        except Exception:
            pass

    seed_initial_data()
    print(f"\n=======================================================")
    print(f" [LM STUDIO API GATEWAY SECURITY ACTIVE]")
    print(f" Admin Key Location: ./data/admin_api_key.txt")
    print(f" Max Concurrency:    {settings.MAX_CONCURRENT_INFERENCES}")
    print(f" Rate Limiting:      Enabled (Sliding Window)")
    print(f"=======================================================\n")
    yield

app = FastAPI(
    title="LM Studio API Gateway",
    description="Centralized platform to create, manage, and distribute custom APIs powered by local LM Studio models",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS securely (without allow_credentials=True when allow_origins=["*"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Include routers
app.include_router(public_api.router)
app.include_router(admin.router)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "LM Studio API Gateway",
        "version": "1.0.0"
    }

