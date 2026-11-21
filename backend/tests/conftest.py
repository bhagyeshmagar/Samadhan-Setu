"""
conftest.py — stubs out all heavy AI / Firebase modules BEFORE any test
imports app.main. This keeps pytest collection fast and lets the HTTP
integration tests run without GPU/network/Firestore credentials.
"""
import sys
import os
from unittest.mock import MagicMock, patch

# H-13 FIX: Warn if TEST_DATABASE_URL is not set
if not os.getenv("TEST_DATABASE_URL"):
    import warnings
    warnings.warn(
        "TEST_DATABASE_URL not set: integration tests will be skipped to avoid running against production data.",
        stacklevel=2,
    )


# ─── 1. Stub heavy torch / ML deps at the module level ───────────────────────
# These must be registered in sys.modules BEFORE any app module is imported.

def _stub_module(name: str, **attrs):
    mod = MagicMock(name=name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[name] = mod
    return mod

# torch and sub-packages used by transformers / sentence-transformers / ultralytics
for _mod in [
    "torch", "torch.nn", "torch.nn.functional", "torch.optim",
    "torch.utils", "torch.utils.data", "torch.cuda",
    "torchvision", "torchvision.transforms",
    "transformers",
    "sentence_transformers",
    "ultralytics",
    "sklearn", "sklearn.metrics", "sklearn.preprocessing",
]:
    if _mod not in sys.modules:
        _stub_module(_mod)

# numpy is used everywhere — keep a lightweight version if not installed
try:
    import numpy  # noqa: F401
except ImportError:
    _stub_module("numpy")

# PIL / Pillow is required by upload tests — keep the real one
# (already installed in venv)

# ─── 2. Stub Firebase / Firestore ─────────────────────────────────────────────
_firebase_admin = _stub_module("firebase_admin")
_firestore_mod  = _stub_module("firebase_admin.firestore")
_credentials    = _stub_module("firebase_admin.credentials")
_stub_module("google.cloud.firestore")

# Also patch the AI bridge / pipeline at module level so importing them is safe
for _ai_mod in [
    "app.services.ai_bridge",
    "app.services.ai_pipeline",
    "app.ai.similarity",
    "app.ai.validator",
]:
    if _ai_mod not in sys.modules:
        _stub_module(_ai_mod)

