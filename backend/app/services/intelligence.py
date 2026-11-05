"""Segment Strategy & Insights: statistics, distinguishing traits and rule-based
recommendations. Everything here is computed from data (no LLM), and every
recommendation carries the statistic that triggered it."""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

from .profiling import column_kind
from .semantics import role_of

HI, LO = 0.5, -0.5
PREFERRED = {"monetary": ["Total_Spend", "Monetary"], "frequency": ["Total_Purchases", "Frequency"],
             "recency": ["Recency", "Recency_Days"], "price_sensitivity": ["Deal_Share", "NumDealsPurchases"],
             "digital": ["Web_Share", "NumWebPurchases"], "household": ["Children"], "income": ["Income"],
             "age": ["Age"], "tenure": ["Tenure_Days"], "campaign": ["Campaigns_Accepted", "Response"],
             "complaint": ["Complain"], "catalog": ["NumCatalogPurchases"], "store": ["NumStorePurchases"]}


def humanize(name: str) -> str:
    s = re.sub(r"^(Mnt|Num)", "", name)
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s).replace("_", " ").strip()
    s = re.sub(r"\bProds?\b", "products", s)
    return s[:1].upper() + s[1:].lower() if s else name


def _fmt(v: float) -> str:
    if v is None or not np.isfinite(v):
        return "—"
    a = abs(v)
    if a >= 1000:
        return f"{v:,.0f}"
    if a >= 10:
        return f"{v:.1f}"
    return f"{v:.2f}"


def describe_columns(df: pd.DataFrame, selected: list[str]) -> list[str]:
    cols = list(selected)
    for c in df.columns:
        if c in cols:
            continue
        if column_kind(df[c], c) in ("numeric", "binary"):
            cols.append(c)
    return cols[:40]


def compute_segments(df: pd.DataFrame, labels: np.ndarray, numeric_sel: list[str],
                     categorical_sel: list[str], silhouette: float | None) -> dict:
    cols = describe_columns(df, numeric_sel)
    num = df[cols].apply(pd.to_numeric, errors="coerce")
    lo, hi = num.quantile(0.01), num.quantile(0.99)
    num = num.clip(lo, hi, axis=1)  # stats on capped values so one extreme customer cannot dominate
    overall_mean, overall_std = num.mean(), num.std().replace(0, np.nan)
    roles = _role_columns(cols)
    product_cols = [c for c in df.columns if re.match(r"mnt", c, re.I)]
    cat_cols = [c for c in df.columns if column_kind(df[c], c) == "categorical"]

    segments = []
    for sid in sorted(set(labels.tolist())):
        mask = labels == sid
        seg = num[mask]
        feats = []
        for c in cols:
            m = float(seg[c].mean())
            z = float((m - overall_mean[c]) / overall_std[c]) if np.isfinite(overall_std[c]) else 0.0
            feats.append({"feature": c, "label": humanize(c), "role": role_of(c), "selected": c in numeric_sel,
                          "segment_mean": round(m, 4), "segment_median": round(float(seg[c].median()), 4),
                          "overall_mean": round(float(overall_mean[c]), 4), "z": round(z, 3)})
        by_feat = {f["feature"]: f for f in feats}
        distinguishing = sorted([f for f in feats if f["selected"]], key=lambda f: -abs(f["z"]))[:4]
        distinguishing += sorted([f for f in feats if not f["selected"] and abs(f["z"]) >= 0.4],
                                 key=lambda f: -abs(f["z"]))[:3]
        cats = []
        for c in cat_cols:
            seg_share = df.loc[mask, c].value_counts(normalize=True)
            all_share = df[c].value_counts(normalize=True)
            if seg_share.empty:
                continue
            top = seg_share.index[0]
            cats.append({"feature": c, "label": humanize(c), "top_value": str(top),
                         "segment_share": round(float(seg_share.iloc[0]), 3),
                         "overall_share": round(float(all_share.get(top, 0)), 3)})
        products = _product_mix(df, mask, product_cols)
        size = int(mask.sum())
        share = size / len(labels)
        noise = sid == -1
        recs = [] if noise else recommend(by_feat, roles, products, share)
        segments.append({
            "id": int(sid), "is_noise": bool(noise),
            "statistical_name": "Outliers / noise" if noise else statistical_name(distinguishing),
            "size": size, "share": round(share, 4),
            "features": feats, "distinguishing": distinguishing, "categorical": cats,
            "product_mix": products, "recommendations": recs,
            "opportunities": [r["title"] for r in recs if r["kind"] == "opportunity"][:4],
            "risks": risks(by_feat, roles, share, silhouette, noise),
        })
    value_col = roles.get("monetary")
    value_rank = None
    if value_col:
        ranked = sorted([s for s in segments if not s["is_noise"]],
                        key=lambda s: -next(f["segment_mean"] for f in s["features"] if f["feature"] == value_col))
        value_rank = {"metric": f"Average {humanize(value_col).lower()} per customer", "column": value_col,
                      "order": [s["id"] for s in ranked]}
    freq_col = roles.get("frequency")
    freq_rank = None
    if freq_col:
        ranked = sorted([s for s in segments if not s["is_noise"]],
                        key=lambda s: -next(f["segment_mean"] for f in s["features"] if f["feature"] == freq_col))
        freq_rank = {"metric": f"Average {humanize(freq_col).lower()}", "column": freq_col,
                     "order": [s["id"] for s in ranked]}
    comparison = {
        "features": [{"feature": c, "label": humanize(c)} for c in numeric_sel],
        "rows": [{"segment": s["id"], "values": [next(f for f in s["features"] if f["feature"] == c)["z"]
                                                  for c in numeric_sel],
                  "means": [next(f for f in s["features"] if f["feature"] == c)["segment_mean"]
                            for c in numeric_sel]} for s in segments],
    }
    return {"segments": segments, "value_rank": value_rank, "frequency_rank": freq_rank,
            "comparison": comparison, "roles": roles,
            "stats_note": "Averages are computed after capping the most extreme 1% of values on each side."}


def _role_columns(cols: list[str]) -> dict:
    roles: dict[str, str] = {}
    for role, names in PREFERRED.items():
        for n in names:
            if n in cols:
                roles[role] = n
                break
    for c in cols:
        r = role_of(c)
        if r and r not in roles:
            roles[r] = c
    visits = next((c for c in cols if re.search(r"visit", c, re.I)), None)
    if visits:
        roles["visits"] = visits
    return roles


def _product_mix(df: pd.DataFrame, mask: np.ndarray, product_cols: list[str]) -> list[dict]:
    if len(product_cols) < 2:
        return []
    seg_tot = df.loc[mask, product_cols].sum()
    all_tot = df[product_cols].sum()
    seg_share = seg_tot / max(seg_tot.sum(), 1)
    all_share = all_tot / max(all_tot.sum(), 1)
    out = [{"category": humanize(c), "feature": c, "segment_share": round(float(seg_share[c]), 3),
            "overall_share": round(float(all_share[c]), 3),
            "lift": round(float(seg_share[c] / all_share[c]), 2) if all_share[c] else None} for c in product_cols]
    return sorted(out, key=lambda r: -(r["lift"] or 0))


def statistical_name(distinguishing: list[dict]) -> str:
    parts = []
    for f in distinguishing[:2]:
        if abs(f["z"]) < 0.25:
            continue
        parts.append(f"{'High' if f['z'] > 0 else 'Low'} {f['label'].lower()}")
    return " · ".join(parts) if parts else "Close to the average customer"


def _ev(f: dict) -> str:
    return (f"{f['label']}: {_fmt(f['segment_mean'])} vs {_fmt(f['overall_mean'])} overall "
            f"({f['z']:+.1f} SD)")


def recommend(by_feat: dict, roles: dict, products: list[dict], share: float) -> list[dict]:
    def z(role):
        c = roles.get(role)
        return by_feat[c]["z"] if c and c in by_feat else None

    def f(role):
        return by_feat[roles[role]]

    recs: list[dict] = []

    def add(title, action, category, evidence, kind="opportunity", priority="medium"):
        recs.append({"title": title, "action": action, "category": category, "why": evidence,
                     "kind": kind, "priority": priority})

    m, r, p, d, freq = z("monetary"), z("recency"), z("price_sensitivity"), z("digital"), z("frequency")
    inc, hh, camp, comp, ten = z("income"), z("household"), z("campaign"), z("complaint"), z("tenure")
    if m is not None and m > HI and (r is None or r < HI):
        add("Reward and protect top spenders", "Create a VIP tier with early access, personal service and loyalty points rather than discounts.",
            "Loyalty programme", [_ev(f("monetary"))] + ([_ev(f("recency"))] if r is not None else []), priority="high")
    if m is not None and m > HI and r is not None and r > HI:
        add("Win back lapsing high-value customers", "Send a personal 'we miss you' offer quickly — these customers are valuable but have not bought recently.",
            "Retention", [_ev(f("monetary")), _ev(f("recency"))], priority="high")
    if r is not None and r > HI and (m is None or m <= HI):
        add("Re-engage before they drift away", "Run a time-limited re-activation message with a reason to return (new arrivals, reminder of favourites).",
            "Re-engagement", [_ev(f("recency"))], priority="high")
    if p is not None and p > HI:
        add("Use targeted deals and bundles", "Reach this group with bundles and timed promotions; they respond to price incentives.",
            "Personalised offers", [_ev(f("price_sensitivity"))])
    if p is not None and p < LO and m is not None and m > 0:
        add("Avoid unnecessary discounting", "This group rarely needs a discount to buy — lead with quality, new products and service to protect margin.",
            "Premium experience", [_ev(f("price_sensitivity")), _ev(f("monetary"))])
    if d is not None and d > HI:
        add("Engage them online first", "Prioritise email, website personalisation and online-exclusive offers.",
            "Digital engagement", [_ev(f("digital"))])
    if "visits" in roles and by_feat[roles["visits"]]["z"] > HI and (freq is None or freq < 0):
        add("Turn browsing into buying", "They visit the website often but buy less — test cart reminders, product recommendations and a first-order incentive.",
            "Conversion", [_ev(by_feat[roles["visits"]])] + ([_ev(f("frequency"))] if freq is not None else []))
    if z("catalog") is not None and z("catalog") > HI:
        add("Keep the catalogue channel", "Catalogue buying is above average here; maintain printed / curated catalogue offers.",
            "Channel", [_ev(f("catalog"))])
    if z("store") is not None and z("store") > HI:
        add("Invest in the in-store experience", "In-store purchases are above average; use in-store events and staff recommendations.",
            "Channel", [_ev(f("store"))])
    if freq is not None and freq < LO and ten is not None and ten < LO:
        add("Onboard newer customers", "A welcome series and a second-purchase incentive can build the habit early.",
            "Onboarding", [_ev(f("frequency")), _ev(f("tenure"))])
    if hh is not None and hh > HI:
        add("Offer family-friendly bundles", "Larger households: family packs, multi-buy offers and kid-related products.",
            "Product", [_ev(f("household"))])
    if inc is not None and inc > HI and m is not None and m < HI - 0.25:
        add("Grow share of wallet", "Income is above average but spend is not — introduce premium ranges and cross-category suggestions.",
            "Upsell", [_ev(f("income")), _ev(f("monetary"))])
    if inc is not None and inc < LO and m is not None and m < LO:
        add("Lead with value ranges", "Budget-friendly products and clear value messaging fit this group's spending level.",
            "Product", [_ev(f("income")), _ev(f("monetary"))])
    if camp is not None and camp > HI:
        add("Prioritise them for campaigns", "They accept marketing campaigns more often than average; include them first when testing new campaigns.",
            "Campaign targeting", [_ev(f("campaign"))])
    if camp is not None and camp < LO and share > 0.15:
        add("Reduce campaign fatigue", "Campaign acceptance is low; send fewer generic campaigns and test a different channel or message.",
            "Campaign targeting", [_ev(f("campaign"))], kind="risk_mitigation")
    if comp is not None and comp > HI:
        add("Fix service issues first", "Complaints are above average; follow up personally before sending promotions.",
            "Service recovery", [_ev(f("complaint"))], kind="risk_mitigation", priority="high")
    top = [pm for pm in products if pm["lift"] and pm["lift"] > 1.15][:2]
    if top:
        add("Lead with their favourite categories", "Feature " + " and ".join(t["category"].lower() for t in top) +
            " in offers and recommendations for this group.", "Product recommendation",
            [f"{t['category']}: {t['segment_share']:.0%} of this group's spend vs {t['overall_share']:.0%} overall" for t in top])
    if not recs:
        add("Test a light-touch nurture programme", "This group sits close to the average customer; A/B test messages before investing heavily.",
            "Experimentation", ["No feature differs from the overall average by more than half a standard deviation."])
    return recs


def risks(by_feat: dict, roles: dict, share: float, silhouette: float | None, noise: bool) -> list[str]:
    out = []
    if noise:
        return ["These customers did not fit any dense group. They are reported separately instead of being forced into a segment."]
    rc = roles.get("recency")
    if rc and by_feat[rc]["z"] > HI:
        out.append("Customers have not bought for longer than average — risk of churn.")
    pc = roles.get("price_sensitivity")
    if pc and by_feat[pc]["z"] > HI:
        out.append("Heavy discount use can squeeze margins if offers are not targeted.")
    cc = roles.get("complaint")
    if cc and by_feat[cc]["z"] > HI:
        out.append("Above-average complaints.")
    if share < 0.06:
        out.append("Small group — test changes on a pilot before scaling.")
    if silhouette is not None and silhouette < 0.25:
        out.append("Segments overlap (moderate silhouette); boundary customers may behave like neighbouring segments.")
    return out
