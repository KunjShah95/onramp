"""Tests for PII field-level encryption at rest."""

import pytest
from app.services.field_encryption import encrypt_field, decrypt_field, email_hash


class TestRoundTrip:
    def test_encrypt_decrypt_round_trip(self):
        """A field encrypted and then decrypted returns the original value."""
        original = "user@example.com"
        encrypted = encrypt_field(original)
        assert encrypted != original
        assert decrypt_field(encrypted) == original

    def test_encrypt_decrypt_name(self):
        """Name fields encrypt and decrypt correctly."""
        original = "John Doe"
        encrypted = encrypt_field(original)
        assert encrypted != original
        assert decrypt_field(encrypted) == original

    def test_empty_string(self):
        """Empty strings are handled gracefully."""
        assert decrypt_field(encrypt_field("")) == ""

    def test_unicode_chars(self):
        """Unicode characters (e.g., accented names) survive round-trip."""
        original = "José García"
        encrypted = encrypt_field(original)
        assert decrypt_field(encrypted) == original


class TestEmailHash:
    def test_consistent_hash(self):
        """Same email always produces the same hash."""
        h1 = email_hash("user@example.com")
        h2 = email_hash("user@example.com")
        assert h1 == h2

    def test_case_insensitive(self):
        """Email hash is case-insensitive."""
        assert email_hash("User@Example.com") == email_hash("user@example.com")

    def test_strips_whitespace(self):
        """Leading/trailing whitespace is stripped before hashing."""
        assert email_hash("  user@example.com  ") == email_hash("user@example.com")

    def test_different_emails_different_hashes(self):
        """Different emails produce different hashes."""
        assert email_hash("alice@example.com") != email_hash("bob@example.com")
