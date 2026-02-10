# app/billing.py
import os
import requests
import stripe
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/billing", tags=["billing"])

# --- SUPABASE CONFIG (from env) ---
def _normalize_url(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    if not raw.startswith("http://") and not raw.startswith("https://"):
        raw = "https://" + raw
    return raw.rstrip("/")

SUPABASE_URL = _normalize_url(os.getenv("SUPABASE_URL"))
SUPABASE_SERVICE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_SERVICE_KEY")
    or os.getenv("SUPABASE_SERVICE_ROLE")
    or ""
).strip()
STRIPE_API_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()

STRIPE_PRICE_GENZ = (os.getenv("STRIPE_PRICE_GNZ") or os.getenv("STRIPE_PRICE_GENZ") or "").strip()
STRIPE_PRICE_MILL = (os.getenv("STRIPE_PRICE_MILL") or os.getenv("STRIPE_PRICE_MILLENIAL") or "").strip()

PRICE_MAP = {
    "GEN_Z": STRIPE_PRICE_GENZ,
    "MILLENIAL": STRIPE_PRICE_MILL,
}


class CheckoutIn(BaseModel):
    tier: str


_billing_initialized = False


def init_billing_env():
    """Initialize billing env. Logs warnings but does not crash on missing config."""
    global _billing_initialized

    missing = []

    if not STRIPE_API_KEY:
        missing.append("STRIPE_SECRET_KEY")

    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")

    if not PRICE_MAP["GEN_Z"] or not PRICE_MAP["MILLENIAL"]:
        missing.append("Stripe Price IDs (STRIPE_PRICE_GENZ / STRIPE_PRICE_MILL)")

    if missing:
        print(f"[billing] WARNING: Missing config: {', '.join(missing)}")
        print("[billing] Billing endpoints will return 503 until configured")
        return

    stripe.api_key = STRIPE_API_KEY
    _billing_initialized = True
    print("[billing] Stripe initialized successfully")


def _billing_unavailable(detail: str):
    return JSONResponse(
        status_code=503,
        content={
            "ok": False,
            "error": "billing_not_configured",
            "detail": detail,
        },
    )


def supabase_get_user(access_token: str) -> dict:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=503, detail="Supabase not configured for billing")

    r = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": SUPABASE_SERVICE_KEY,
        },
        timeout=20,
    )

    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Supabase session")

    return r.json()


@router.post("/checkout-session")
def create_checkout_session(payload: CheckoutIn, authorization: str = Header(None)):
    try:
        if not _billing_initialized:
            init_billing_env()

        if not _billing_initialized:
            return _billing_unavailable("Billing not configured")

        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing Bearer token")

        token = authorization.split(" ", 1)[1].strip()
        user = supabase_get_user(token)

        user_id = user["id"]
        email = user.get("email")

        tier = payload.tier.strip().upper()
        if tier not in PRICE_MAP:
            raise HTTPException(status_code=400, detail="Unknown tier")

        price_id = PRICE_MAP[tier]

        app_url = (os.getenv("APP_URL") or "https://emoria.life").rstrip("/")
        success_url = f"{app_url}/app/subscription?checkout=success"
        cancel_url = f"{app_url}/app/subscription?checkout=cancel"

        # --- STRIPE CHECKOUT SESSION ---
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=email,

            # 🔑 CRITICAL: user binding
            client_reference_id=user_id,
            metadata={"tier": tier, "user_id": user_id},
            subscription_data={"metadata": {"tier": tier, "user_id": user_id}},
        )

        return {"url": session.url}

    except HTTPException:
        raise
    except Exception as e:
        print("[billing.checkout-session] ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=f"checkout-session error: {e}")
