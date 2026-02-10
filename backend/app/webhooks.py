# app/webhooks.py
from __future__ import annotations

import os
import json
from typing import Optional

import stripe
import httpx
from fastapi import APIRouter, Request, HTTPException, Header

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip()
SUPABASE_SERVICE_KEY = (os.getenv("SUPABASE_SERVICE_KEY") or "").strip()

STRIPE_API_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
STRIPE_WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()

if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY


async def supabase_request(method: str, table: str, params: dict | None = None, data: dict | None = None):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise Exception("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)")

    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    async with httpx.AsyncClient(timeout=20) as client:
        if method == "GET":
            r = await client.get(url, headers=headers, params=params)
        elif method == "POST":
            r = await client.post(url, headers=headers, json=data)
        elif method == "PATCH":
            r = await client.patch(url, headers=headers, params=params, json=data)
        else:
            raise ValueError(f"Unsupported method: {method}")

        r.raise_for_status()
        return r.json()


async def supabase_get_user_by_id(user_id: str):
    rows = await supabase_request(
        "GET",
        "user_profiles",
        params={"select": "id,email,tier", "id": f"eq.{user_id}"},
    )
    return rows[0] if rows else None


async def supabase_get_user_by_customer(customer_id: str):
    rows = await supabase_request(
        "GET",
        "user_profiles",
        params={"select": "id,email,tier", "stripe_customer_id": f"eq.{customer_id}"},
    )
    return rows[0] if rows else None


async def log_subscription_event(user_id: str, event_type: str, tier: Optional[str], stripe_event_id: str, metadata: dict):
    await supabase_request(
        "POST",
        "subscription_events",
        data={
            "user_id": user_id,
            "event_type": event_type,
            "tier": tier,
            "stripe_event_id": stripe_event_id,
            "metadata": metadata,
        },
    )


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    body = await request.body()

    # ✅ Stripe SDK signature verification (megbízható)
    try:
        if STRIPE_WEBHOOK_SECRET:
            if not stripe_signature:
                raise HTTPException(status_code=400, detail="Missing stripe-signature header")
            event = stripe.Webhook.construct_event(body, stripe_signature, STRIPE_WEBHOOK_SECRET)
        else:
            # dev fallback (NEM ajánlott prod)
            event = json.loads(body.decode("utf-8"))
    except HTTPException:
        raise
    except Exception as e:
        print("[webhook] signature/parse error:", repr(e))
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {e}")

    event_type = event["type"] if isinstance(event, dict) else event.type
    data_obj = (event["data"]["object"] if isinstance(event, dict) else event.data.object)

    print(f"[webhook] received: {event_type}")

    try:
        if event_type == "checkout.session.completed":
            await handle_checkout_completed(data_obj, event_id=(event["id"] if isinstance(event, dict) else event.id))

        elif event_type == "customer.subscription.updated":
            await handle_subscription_updated(data_obj, event_id=(event["id"] if isinstance(event, dict) else event.id))

        elif event_type == "customer.subscription.deleted":
            await handle_subscription_deleted(data_obj, event_id=(event["id"] if isinstance(event, dict) else event.id))

        else:
            # ignore
            pass

        return {"ok": True}

    except Exception as e:
        print("[webhook] handler error:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


async def handle_checkout_completed(session: dict, event_id: str):
    # Stripe session mezők
    user_id = session.get("client_reference_id") or (session.get("metadata") or {}).get("user_id")
    tier = (session.get("metadata") or {}).get("tier")

    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    # email fallback (Stripe sokszor customer_email=null)
    email = session.get("customer_email")
    if not email:
        cd = session.get("customer_details") or {}
        email = cd.get("email")

    if not user_id or not tier:
        # Ez a legfontosabb: ha itt nincs user_id+tier, nincs mire syncelni.
        raise Exception(f"Missing user_id/tier on session. user_id={user_id}, tier={tier}")

    user = await supabase_get_user_by_id(user_id)
    if not user:
        raise Exception(f"User not found in Supabase by id: {user_id}")

    await supabase_request(
        "PATCH",
        "user_profiles",
        params={"id": f"eq.{user_id}"},
        data={
            "tier": tier,
            "stripe_customer_id": customer_id,
            "stripe_subscription_id": subscription_id,
            "subscription_status": "active",
            "email": email or user.get("email"),
        },
    )

    await log_subscription_event(
        user_id=user_id,
        event_type="checkout.session.completed",
        tier=tier,
        stripe_event_id=event_id,
        metadata={
            "customer_id": customer_id,
            "subscription_id": subscription_id,
            "email": email,
        },
    )

    print(f"[webhook] user {user_id} upgraded => {tier}")


async def handle_subscription_updated(subscription: dict, event_id: str):
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")
    status = subscription.get("status")

    # tier: prefer subscription.metadata.tier (mert mi beírjuk subscription_data.metadata-val)
    tier = (subscription.get("metadata") or {}).get("tier")

    user = None
    if customer_id:
        user = await supabase_get_user_by_customer(customer_id)

    if not user:
        # ha nincs user, nem crash-elünk végtelenül, de logoljuk
        raise Exception(f"User not found for stripe_customer_id={customer_id}")

    user_id = user["id"]

    update_data = {
        "subscription_status": status,
        "stripe_subscription_id": subscription_id,
    }
    if tier:
        update_data["tier"] = tier

    await supabase_request("PATCH", "user_profiles", params={"id": f"eq.{user_id}"}, data=update_data)

    await log_subscription_event(
        user_id=user_id,
        event_type="customer.subscription.updated",
        tier=tier,
        stripe_event_id=event_id,
        metadata={"status": status, "subscription_id": subscription_id},
    )


async def handle_subscription_deleted(subscription: dict, event_id: str):
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")

    user = None
    if customer_id:
        user = await supabase_get_user_by_customer(customer_id)

    if not user:
        raise Exception(f"User not found for stripe_customer_id={customer_id}")

    user_id = user["id"]

    await supabase_request(
        "PATCH",
        "user_profiles",
        params={"id": f"eq.{user_id}"},
        data={
            "tier": "FREE",
            "subscription_status": "canceled",
            "stripe_subscription_id": subscription_id,
        },
    )

    await log_subscription_event(
        user_id=user_id,
        event_type="customer.subscription.deleted",
        tier="FREE",
        stripe_event_id=event_id,
        metadata={"subscription_id": subscription_id},
    )
