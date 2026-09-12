"""Shared service primitives (backwards-compatible facades).

New code should import from here (CacheBackend, TenantScopedSettingStore,
AuditStore, BaseIntegrationClient, domain errors). Existing modules keep
their public names and delegate to these primitives so no caller breaks.
"""
