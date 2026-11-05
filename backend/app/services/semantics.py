"""Name-based semantic roles for columns.

Roles let profiling, recommendations and personas talk about *what a column
means* (spend, frequency, recency...) without assuming a fixed schema. A column
with no recognised role is still analysed generically.
"""
from __future__ import annotations

import re

# role -> (regex on lowercase name, human description, higher_is_better?)
ROLE_RULES: list[tuple[str, str, str]] = [
    ("recency", r"recen|days_?since|last_?purchase", "days since the last purchase (lower = more recent)"),
    ("price_sensitivity", r"deal|discount|coupon|promo", "use of deals and discounts"),
    ("monetary", r"spend|^mnt|amount|monetary|revenue|sales|total_?value|purchase_?value|avg_?order", "money spent"),
    ("digital", r"web|online|app|visit|click|session", "online / digital activity"),
    ("catalog", r"catalog", "catalogue purchases"),
    ("store", r"store|instore|in_store|offline", "in-store purchases"),
    ("frequency", r"purchases|frequency|orders|num_?trans|transactions|invoice", "how often customers buy"),
    ("income", r"income|salary|annual_?income", "income"),
    ("age", r"^age$|year_?birth|birth", "age"),
    ("household", r"kid|teen|child|household|family|dependents", "household size / children"),
    ("tenure", r"tenure|since|dt_customer|join|signup|member", "how long they have been a customer"),
    ("campaign", r"accepted|cmp|response|campaign", "response to marketing campaigns"),
    ("complaint", r"complain", "complaints"),
    ("score", r"score|rating|satisf", "score or rating"),
    ("gender", r"gender|^sex$", "gender"),
    ("education", r"educat", "education level"),
    ("marital", r"marital|relationship", "relationship status"),
]

ID_PATTERN = re.compile(r"(^|_)(id|uuid|guid|key)$|^id|customer_?id|client_?id|user_?id|customerid", re.I)
PII_PATTERN = re.compile(r"name|email|phone|address|street|zip|postcode|ssn|passport|card", re.I)


def role_of(column: str) -> str | None:
    name = column.lower()
    for role, pattern, _ in ROLE_RULES:
        if re.search(pattern, name):
            return role
    return None


def role_description(role: str | None) -> str | None:
    for r, _, desc in ROLE_RULES:
        if r == role:
            return desc
    return None


def looks_like_id(column: str) -> bool:
    return bool(ID_PATTERN.search(column))


def looks_like_pii(column: str) -> bool:
    return bool(PII_PATTERN.search(column))
