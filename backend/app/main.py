import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models import Endpoint, ApiKey, SystemSetting
from app.services.auth import hash_key
from app.routers import admin, public_api

from sqlalchemy import text

def seed_initial_data():
    """Seeds sample endpoints and default API key on first run."""
    db: Session = SessionLocal()
    try:
        # Check if endpoints exist
        if db.query(Endpoint).count() == 0:
            demo1 = Endpoint(
                name="General AI Assistant",
                slug="general-assistant",
                description="Fast multi-purpose conversational AI assistant",
                is_active=True,
                auth_required=False,
                model_name="", # Auto-detect from LM Studio
                system_prompt="You are an intelligent, helpful, and concise AI assistant.",
                temperature=0.7,
                top_p=0.95,
                max_tokens=2048,
                stream_allowed=True
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
                stream_allowed=True
            )
            db.add(demo1)
            db.add(demo2)

        # Check if API keys exist
        if db.query(ApiKey).count() == 0:
            demo_raw_key = "ak_live_demo1234567890abcdef12345"
            demo_key = ApiKey(
                name="Default Development Key",
                key_hash=hash_key(demo_raw_key),
                key_prefix=demo_raw_key[:12] + "...",
                raw_key=demo_raw_key,
                allowed_slugs="*",
                is_active=True
            )
            db.add(demo_key)

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
            result = conn.execute(text("PRAGMA table_info(api_keys)")).fetchall()
            columns = [row[1] for row in result]
            if "raw_key" not in columns:
                conn.execute(text("ALTER TABLE api_keys ADD COLUMN raw_key VARCHAR(80) DEFAULT ''"))
                conn.commit()
            conn.execute(text("UPDATE api_keys SET raw_key = 'ak_live_demo1234567890abcdef12345' WHERE name = 'Default Development Key' AND (raw_key IS NULL OR raw_key = '')"))
            conn.commit()

            ep_result = conn.execute(text("PRAGMA table_info(endpoints)")).fetchall()
            ep_columns = [row[1] for row in ep_result]
            if "enable_reasoning" not in ep_columns:
                conn.execute(text("ALTER TABLE endpoints ADD COLUMN enable_reasoning BOOLEAN DEFAULT 1"))
                conn.commit()
        except Exception:
            pass

    seed_initial_data()
    yield
    # Shutdown logic if any

app = FastAPI(
    title="LM Studio API Gateway",
    description="Centralized platform to create, manage, and distribute custom APIs powered by local LM Studio models",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for all clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
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
