"""
Firestore Database Service
Provides a unified Firestore interface with graceful fallback to in-memory dicts.
When FIREBASE_PROJECT_ID / GOOGLE_APPLICATION_CREDENTIALS are not set,
operations use in-memory storage so development always works.
"""

import os
import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


# ─── Storage backend abstraction ─────────────────────────────────────────────

class FirestoreStorageBackend:
    """Abstracts Firestore vs in-memory storage. Use get_storage() to obtain an instance."""

    async def create_document(self, collection: str, doc_id: str, data: dict) -> dict:
        raise NotImplementedError

    async def get_document(self, collection: str, doc_id: str) -> Optional[dict]:
        raise NotImplementedError

    async def update_document(self, collection: str, doc_id: str, data: dict) -> dict:
        raise NotImplementedError

    async def delete_document(self, collection: str, doc_id: str) -> None:
        raise NotImplementedError

    async def list_documents(self, collection: str) -> List[dict]:
        raise NotImplementedError

    async def query_documents(
        self, collection: str, filters: List[Tuple[str, str, Any]] = None
    ) -> List[dict]:
        raise NotImplementedError


# ─── In-Memory Backend (fallback) ────────────────────────────────────────────

class InMemoryBackend(FirestoreStorageBackend):
    def __init__(self):
        self._stores: Dict[str, Dict[str, dict]] = {}

    def _store(self, collection: str) -> Dict[str, dict]:
        if collection not in self._stores:
            self._stores[collection] = {}
        return self._stores[collection]

    async def create_document(self, collection: str, doc_id: str, data: dict) -> dict:
        store = self._store(collection)
        store[doc_id] = data
        return data

    async def get_document(self, collection: str, doc_id: str) -> Optional[dict]:
        return self._store(collection).get(doc_id)

    async def update_document(self, collection: str, doc_id: str, data: dict) -> dict:
        store = self._store(collection)
        if doc_id in store:
            store[doc_id].update(data)
        else:
            store[doc_id] = data
        return store[doc_id]

    async def delete_document(self, collection: str, doc_id: str) -> None:
        self._store(collection).pop(doc_id, None)

    async def list_documents(self, collection: str) -> List[dict]:
        return list(self._store(collection).values())

    async def query_documents(
        self, collection: str, filters: List[Tuple[str, str, Any]] = None
    ) -> List[dict]:
        docs = list(self._store(collection).values())
        if not filters:
            return docs
        result = []
        for doc in docs:
            match = True
            for key, op, value in filters:
                doc_val = doc.get(key)
                if op == "==" and doc_val != value:
                    match = False
                    break
                if op == "in" and doc_val not in (value or []):
                    match = False
                    break
                if op == "array_contains" and value not in (doc_val or []):
                    match = False
                    break
            if match:
                result.append(doc)
        return result


# ─── Firestore Backend (real) ────────────────────────────────────────────────

class _RealFirestoreBackend(FirestoreStorageBackend):
    def __init__(self, app):
        from google.cloud import firestore  # type: ignore

        self._db = firestore.firestore.Client(app=app)

    async def create_document(self, collection: str, doc_id: str, data: dict) -> dict:
        self._db.collection(collection).document(doc_id).set(data)
        return data

    async def get_document(self, collection: str, doc_id: str) -> Optional[dict]:
        doc = self._db.collection(collection).document(doc_id).get()
        if doc.exists:
            data = doc.to_dict() or {}
            data["id"] = doc.id
            return data
        return None

    async def update_document(self, collection: str, doc_id: str, data: dict) -> dict:
        self._db.collection(collection).document(doc_id).update(data)
        return data

    async def delete_document(self, collection: str, doc_id: str) -> None:
        self._db.collection(collection).document(doc_id).delete()

    async def list_documents(self, collection: str) -> List[dict]:
        docs = self._db.collection(collection).stream()
        return [{**d.to_dict(), "id": d.id} for d in docs]

    async def query_documents(
        self, collection: str, filters: List[Tuple[str, str, Any]] = None
    ) -> List[dict]:
        query = self._db.collection(collection)
        if filters:
            for key, op, value in filters:
                query = query.where(key, op, value)
        docs = query.stream()
        return [{**d.to_dict(), "id": d.id} for d in docs]


# ─── Singleton ───────────────────────────────────────────────────────────────

_backend: Optional[FirestoreStorageBackend] = None
_firebase_app = None


def _try_init_firebase() -> tuple:
    """Attempt to initialize Firebase Admin SDK. Returns (success, app_or_error)."""
    try:
        import firebase_admin  # type: ignore
        from firebase_admin import credentials

        project_id = os.getenv("FIREBASE_PROJECT_ID", "")
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        cred_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")

        if not project_id and not cred_path and not cred_json:
            return False, "FIREBASE_PROJECT_ID not set"

        cred = None
        if cred_json:
            cred = credentials.Certificate(json.loads(cred_json))
        elif cred_path:
            cred = credentials.Certificate(cred_path)

        opts = {"projectId": project_id} if project_id else {}

        if cred:
            app = firebase_admin.initialize_app(cred, opts)
        else:
            app = firebase_admin.initialize_app(options=opts)

        return True, app
    except Exception as e:
        return False, str(e)


def get_storage() -> FirestoreStorageBackend:
    """Return the shared storage backend (Firestore if configured, otherwise in-memory)."""
    global _backend, _firebase_app

    if _backend is not None:
        return _backend

    success, result = _try_init_firebase()
    if success:
        _firebase_app = result
        _backend = _RealFirestoreBackend(_firebase_app)
    else:
        _backend = InMemoryBackend()

    return _backend


def generate_id() -> str:
    """Generate a short unique document ID."""
    return uuid.uuid4().hex[:20]
