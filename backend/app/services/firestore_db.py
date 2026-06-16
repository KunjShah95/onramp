"""
Firestore Database Service Wrapper
Provides backward compatibility by re-exporting the storage backend
and utility functions from postgres_db.
"""

from app.services.postgres_db import get_storage, generate_id, StorageBackend

# Export for compatibility
__all__ = ["get_storage", "generate_id", "StorageBackend"]
