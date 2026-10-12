import json
import os
from pathlib import Path

import numpy as np
import requests
from sentence_transformers import SentenceTransformer

BASE = Path(__file__).parent
SCHEMES = json.loads((BASE / "schemes.json").read_text(encoding="utf-8"))

print("Loading embedding model (first run downloads ~90 MB)...")
model = SentenceTransformer("all-MiniLM-L6-v2")  # free, runs on CPU


def scheme_text(s):
    return (f"{s['name']}. Category: {s['category']}. For: {s['target_group']}. "
            f"{s['description']} Benefits: {s['benefits']}")


# Sentence embeddings for every scheme (computed once at startup)
EMB = model.encode([scheme_text(s) for s in SCHEMES], normalize_embeddings=True)


def money(n):
    return f"₹{n / 100000:g} lakh" if n >= 100000 else f"₹{n:,.0f}"


def pretty(items):
    return ", ".join(i.replace("_", " ") for i in items)


# ---------- Rule-based eligibility matching ----------
def check_eligibility(p, s):
    e = s.get("eligibility", {})
    met, gaps, unknown = [], [], []

    lo, hi = e.get("min_age"), e.get("max_age")
    if lo is not None or hi is not None:
        rng = f"{lo or 0}–{hi}" if hi is not None else f"{lo}+"
        age = p.get("age")
        if age is None:
            unknown.append(f"Age must be {rng}")
        elif (lo is not None and age < lo) or (hi is not None and age > hi):
            gaps.append(f"Age {age} is outside the required range ({rng})")
        else:
            met.append(f"Age {age} fits the {rng} range")

    cap = e.get("max_income")
    if cap is not None:
        inc = p.get("annual_income")
        if inc is None:
            unknown.append(f"Family income must be up to {money(cap)} per year")
        elif inc > cap:
            gaps.append(f"Income {money(inc)} is above the limit of {money(cap)}")
        else:
            met.append(f"Income {money(inc)} is within the {money(cap)} limit")

    def check_list(key, value, label):
        allowed = e.get(key)
        if not allowed:
            return
        if not value:
            unknown.append(f"{label} must be: {pretty(allowed)}")
        elif value in allowed:
            met.append(f"{label} ({value.replace('_', ' ')}) fits")
        else:
            gaps.append(f"{label} '{value.replace('_', ' ')}' is not covered (needs: {pretty(allowed)})")

    check_list("genders", p.get("gender"), "Gender")
    check_list("occupations", p.get("occupation"), "Occupation")
    check_list("categories", p.get("category"), "Social category")
    check_list("states", p.get("state"), "State")
    check_list("residence", p.get("residence"), "Area")

    if gaps:
        status = "gap"
    elif unknown or not met:
        status = "likely"
    else:
        status = "match"
    return status, met, gaps, unknown


# ---------- Retrieval + ranking ----------
def recommend(profile, query, top_k=8):
    if query.strip():
        q = model.encode([query], normalize_embeddings=True)[0]
        sims = EMB @ q  # cosine similarity (vectors are normalised)
    else:
        sims = np.zeros(len(SCHEMES))

    results = []
    for s, sim in zip(SCHEMES, sims):
        status, met, gaps, unknown = check_eligibility(profile, s)
        if len(gaps) > 2:
            continue  # too far from eligible, don't show
        checked = len(met) + len(gaps) + len(unknown)
        ratio = len(met) / checked if checked else 0.5
        sim = float(max(0.0, sim))
        score = 0.75 * sim + 0.25 * ratio
        results.append({
            "id": s["id"], "name": s["name"], "ministry": s["ministry"],
            "category": s["category"], "target_group": s["target_group"],
            "description": s["description"], "benefits": s["benefits"],
            "documents": s["documents"], "how_to_apply": s["how_to_apply"],
            "notes": s.get("notes", ""), "url": s["url"],
            "relevance": round(min(1.0, sim / 0.6) * 100),  # scaled for display
            "status": status, "met": met, "gaps": gaps, "unknown": unknown,
            "_score": score,
        })

    results.sort(key=lambda r: r["_score"], reverse=True)
    results = results[:top_k]
    for r in results:
        r.pop("_score")
    return results


# ---------- RAG explanation (retrieved data -> Gemini) ----------
def fallback_summary(top):
    if not top:
        return "No close matches yet. Try describing your need differently or fill in more profile details."
    names = ", ".join(r["name"] for r in top[:3])
    return (f"Based on your profile and request, the most relevant schemes are: {names}. "
            "Open each card to see why it matches, what you may still be missing, "
            "and the documents to keep ready.")


def llm_summary(profile, query, results):
    top = [r for r in results if r["status"] != "gap"][:3] or results[:3]
    key = os.getenv("GEMINI_API_KEY")
    if not key or not top:
        return fallback_summary(top)

    context = "\n\n".join(
        f"SCHEME: {r['name']}\nBenefits: {r['benefits']}\n"
        f"Conditions met: {r['met']}\nGaps: {r['gaps']}\nStill to confirm: {r['unknown']}\n"
        f"Notes: {r['notes']}\nDocuments: {r['documents']}\nOfficial link: {r['url']}"
        for r in top
    )
    prompt = f"""You are a helpful assistant for Indian citizens finding government schemes.
Use ONLY the scheme information below. Do not invent amounts, dates or rules.
Write 4-6 short sentences in simple English: say which scheme fits best and why,
mention any eligibility gap or thing to confirm, and end by reminding the user to
verify details on the official link.

CITIZEN PROFILE: {profile}
CITIZEN REQUEST: {query or 'not specified'}

RETRIEVED SCHEME INFORMATION:
{context}
"""
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
    try:
        r = requests.post(
            url,
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as ex:
        print("Gemini error (using fallback):", ex)
        return fallback_summary(top)