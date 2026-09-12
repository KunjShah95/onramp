"""Core layer — central config + single-source auth crypto.

New code should import from here instead of reading os.getenv directly::

    from app.core.config import get_settings
    from app.core import security
"""

from app.core.config import Settings, get_settings, reset_settings
from app.core import security

__all__ = ["Settings", "get_settings", "reset_settings", "security"]
