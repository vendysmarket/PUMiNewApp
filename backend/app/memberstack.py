from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional, Literal

import requests

# Updated tier names to match frontend
Tier = Literal["FREE", "GEN_Z", "MILLENIAL"]


@dataclass
class MemberAccess:
    tier: Tier
    plan_id: Optional[str] = None


MEMBERSTACK_SECRET_KEY = os.getenv("MEMBERSTACK_SECRET_KEY", "").strip()
MEMBERSTACK_BASE_URL = os.getenv("MEMBERSTACK_BASE_URL", "https://api.memberstack.com").rstrip("/")

# Your plan IDs - PRODUCTION VALUES
PLAN_ID_GENZ = os.getenv("MEMBERSTACK_PLAN_ID_GENZ", "pln_edu-student-core-plan-vk18q0u12").strip()
PLAN_ID_MILLENIAL = os.getenv("MEMBERSTACK_PLAN_ID_MILLENIAL", "pln_core-plan-el5z00mh").strip()


def _safe_get_plan_id(data: dict) -> Optional[str]:
    """
    Tries common shapes for plan id.
    We prefer exact plan_id matching.
    """
    d = data.get("data") or data

    # data.plan.id
    plan = d.get("plan")
    if isinstance(plan, dict):
        pid = plan.get("id") or plan.get("_id")
        if isinstance(pid, str) and pid.strip():
            return pid.strip()

    # data.planConnections[0].plan.id
    pcs = d.get("planConnections")
    if isinstance(pcs, list) and pcs:
        first = pcs[0] or {}
        p = first.get("plan") or {}
        if isinstance(p, dict):
            pid = p.get("id") or p.get("_id")
            if isinstance(pid, str) and pid.strip():
                return pid.strip()

    # data.subscriptions[0].plan.id
    subs = d.get("subscriptions")
    if isinstance(subs, list) and subs:
        first = subs[0] or {}
        p = first.get("plan") or {}
        if isinstance(p, dict):
            pid = p.get("id") or p.get("_id")
            if isinstance(pid, str) and pid.strip():
                return pid.strip()

    return None


def _infer_access_from_plan_id(plan_id: Optional[str]) -> MemberAccess:
    """
    Map Memberstack plan ID to tier.
    """
    if not plan_id:
        return MemberAccess(tier="FREE", plan_id=None)

    if plan_id == PLAN_ID_GENZ:
        return MemberAccess(tier="GEN_Z", plan_id=plan_id)

    if plan_id == PLAN_ID_MILLENIAL:
        return MemberAccess(tier="MILLENIAL", plan_id=plan_id)

    # Unknown plan => safe fallback to FREE
    return MemberAccess(tier="FREE", plan_id=plan_id)


def get_member_access(memberstack_id: Optional[str], timeout_sec: int = 8) -> MemberAccess:
    """
    Get member tier from Memberstack API.
    Any error => FREE (safe fallback).
    """
    msid = (memberstack_id or "").strip()
    if not MEMBERSTACK_SECRET_KEY or not msid:
        return MemberAccess(tier="FREE")

    try:
        url = f"{MEMBERSTACK_BASE_URL}/v1/members/{msid}"
        headers = {"X-API-KEY": MEMBERSTACK_SECRET_KEY}
        r = requests.get(url, headers=headers, timeout=timeout_sec)
        if r.status_code != 200:
            return MemberAccess(tier="FREE")

        data = r.json() if "application/json" in (r.headers.get("content-type") or "") else {}
        plan_id = _safe_get_plan_id(data)
        return _infer_access_from_plan_id(plan_id)
    except Exception:
        return MemberAccess(tier="FREE")