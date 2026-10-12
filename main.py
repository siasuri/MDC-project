from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()
import engine  # noqa: E402  (must load after .env)

app = FastAPI(title="Citizen Benefit Navigator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Profile(BaseModel):
    age: Optional[int] = None
    annual_income: Optional[int] = None
    state: Optional[str] = None
    gender: Optional[str] = None       # female | male | other
    occupation: Optional[str] = None
    category: Optional[str] = None     # General | OBC | SC | ST | EWS
    residence: Optional[str] = None    # rural | urban


class RecommendRequest(BaseModel):
    query: str = ""
    profile: Profile = Profile()


@app.get("/api/health")
def health():
    return {"status": "ok", "schemes_loaded": len(engine.SCHEMES)}


@app.post("/api/recommend")
def recommend(req: RecommendRequest):
    profile = req.profile.model_dump()
    results = engine.recommend(profile, req.query)
    summary = engine.llm_summary(profile, req.query, results)
    return {"summary": summary, "results": results}