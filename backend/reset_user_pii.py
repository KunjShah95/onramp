"""Recovery tool for PII encrypted with the lost PII_ENCRYPTION_KEY.

On 2026-08-09 migration 022 encrypted all users' name/email with a Fernet key
that is no longer available. This tool helps restore that data by re-encrypting
a user's real name/email with the CURRENT PII_ENCRYPTION_KEY.

USAGE (run from the backend/ directory, uses backend/.env):
  python reset_user_pii.py --check          # how many names/emails decrypt today
  python reset_user_pii.py --list           # list users (id prefix, dates, readable state)
  python reset_user_pii.py --set <uid-prefix> --name "Real Name" [--email real@example.com]
  python reset_user_pii.py --set <uid-prefix> --name "Real Name" --force  # overwrite even if readable
  python reset_user_pii.py --csv users.csv [--dry-run]   # bulk restore: uid,name,email

Only --set/--csv write to the database; everything else is read-only. Rows are
refused when the name/email is already readable with the current key unless
--force is passed, and duplicate emails are refused (matched by email_hash).

NOTE: if you later recover the ORIGINAL key, just put it back in backend/.env —
all previously encrypted values will decrypt again (Fernet is stateless).
"""
import argparse
import asyncio
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.chdir(HERE)

# Load backend/.env (same file the app loads via load_dotenv()).
if (HERE / ".env").exists():
    for line in (HERE / ".env").read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

from sqlalchemy import select  # noqa: E402
from app.database.config import db_config  # noqa: E402
from app.database.models import User  # noqa: E402
from app.services.field_encryption import encrypt_field, email_hash  # noqa: E402

_FERNET_PREFIX = "gAAAAA"
LOST_KEY_MARKER = "<encrypted with LOST key - set a new value>"
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _fernet():
    """Return a Fernet instance for the current key, or None."""
    key = os.getenv("PII_ENCRYPTION_KEY")
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet

        return Fernet(key.encode())
    except Exception:
        return None


def _readable(value: str | None) -> str:
    """Return the plaintext value, or LOST_KEY_MARKER when it can't be decrypted."""
    if not value:
        return ""
    if value.startswith(_FERNET_PREFIX):
        f = _fernet()
        if f is None:
            return LOST_KEY_MARKER
        try:
            plain = f.decrypt(value.encode()).decode()
        except Exception:
            return LOST_KEY_MARKER
        return plain or LOST_KEY_MARKER
    return value


async def check() -> None:
    key_ok = bool(os.getenv("PII_ENCRYPTION_KEY"))
    print(f"PII_ENCRYPTION_KEY present: {key_ok}")
    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        rows = (await session.execute(select(User))).scalars().all()
    names_ok = sum(1 for u in rows if _readable(u.name) != LOST_KEY_MARKER)
    emails_ok = sum(1 for u in rows if _readable(u.email) != LOST_KEY_MARKER)
    print(f"users: {len(rows)} | names readable: {names_ok}/{len(rows)} | emails readable: {emails_ok}/{len(rows)}")


async def list_users() -> None:
    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        rows = (await session.execute(select(User).order_by(User.created_at))).scalars().all()
    print(f"{'id (prefix)':<12} {'provider':<10} {'admin':<6} {'created':<12} name/email")
    print("-" * 84)
    for u in rows:
        created = u.created_at.strftime("%Y-%m-%d") if u.created_at else "?"
        print(f"{str(u.id)[:8]:<12} {u.provider:<10} {str(u.is_admin):<6} {created:<12} {_readable(u.name)!r} / {_readable(u.email)!r}")


async def _resolve_user(session, uid: str):
    """Resolve a full id or an unambiguous id prefix."""
    uid = uid.strip()
    try:
        uuid.UUID(uid)
        user = (
            await session.execute(select(User).where(User.id == uid))
        ).scalar_one_or_none()
        if user:
            return user
    except (ValueError, TypeError):
        pass
    prefix = uid.lower()
    rows = (await session.execute(select(User))).scalars().all()
    matches = [u for u in rows if str(u.id).lower().startswith(prefix)]
    if not matches:
        sys.exit(f"No user found with id/prefix {uid!r}. Use --list to see prefixes.")
    if len(matches) > 1:
        sys.exit(
            f"Prefix {uid!r} is ambiguous - matches {len(matches)} users: "
            + ", ".join(str(u.id) for u in matches[:10])
        )
    return matches[0]


async def _apply_updates(session, user_row, name: str | None, email: str | None, force: bool, dry_run: bool = False) -> None:
    """Shared apply logic for --set and --csv. Mutates user_row and commits."""
    updates: dict = {}

    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("Name cannot be empty")
        if len(name) > 120:
            raise ValueError("Name must be 120 characters or fewer")
        if not force and _readable(user_row.name) != LOST_KEY_MARKER:
            raise ValueError(
                f"Name is already readable ({_readable(user_row.name)!r}) - pass --force to overwrite"
            )
        updates["name"] = encrypt_field(name)

    if email is not None:
        email = email.strip().lower()
        if not email or len(email) > 255 or not _EMAIL_RE.match(email):
            raise ValueError(f"Invalid email {email!r}")
        dups = (
            await session.execute(select(User).where(User.email_hash == email_hash(email)))
        ).scalars().all()
        dups = [d for d in dups if str(d.id) != str(user_row.id)]
        if dups:
            raise ValueError(
                f"Email {email!r} already belongs to user(s): " + ", ".join(str(d.id) for d in dups[:5])
            )
        if not force and _readable(user_row.email) != LOST_KEY_MARKER:
            raise ValueError(
                f"Email is already readable ({_readable(user_row.email)!r}) - pass --force to overwrite"
            )
        updates["email"] = encrypt_field(email)
        updates["email_hash"] = email_hash(email)
        updates["email_verified"] = True

    if not updates:
        print(f"  {str(user_row.id)[:8]}.. nothing to update")
        return

    if dry_run:
        print(f"  [dry-run] {str(user_row.id)[:8]}.. would set: {', '.join(sorted(updates))}")
        return

    for k, v in updates.items():
        setattr(user_row, k, v)
    user_row.updated_at = datetime.now(timezone.utc)
    session.add(user_row)
    await session.commit()
    print(f"  {str(user_row.id)[:8]}.. updated: {', '.join(sorted(updates))} (encrypted with current key)")


async def set_user(uid: str, name: str | None, email: str | None, force: bool) -> None:
    if not name and not email:
        sys.exit("Provide at least one of --name or --email")

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        user_row = await _resolve_user(session, uid)
        try:
            await _apply_updates(session, user_row, name, email, force)
        except ValueError as exc:
            sys.exit(f"User {uid}: {exc}")


async def csv_restore(csv_path: str, force: bool, dry_run: bool) -> None:
    """Bulk restore from a CSV with header: uid,name,email."""
    import csv as _csv

    path = Path(csv_path)
    if not path.exists():
        sys.exit(f"CSV not found: {csv_path}")
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = _csv.DictReader(fh)
        required = {"uid", "name", "email"}
        headers = {(h or "").strip().lower() for h in (reader.fieldnames or [])}
        if not required.issubset(headers):
            sys.exit(f"CSV must have columns uid,name,email; got {sorted(headers)}")
        for lineno, raw in enumerate(reader, start=2):
            if not any((raw.get(k) or "").strip() for k in ("uid", "name", "email")):
                continue
            rows.append({
                "uid": (raw.get("uid") or "").strip(),
                "name": (raw.get("name") or "").strip() or None,
                "email": (raw.get("email") or "").strip() or None,
                "lineno": lineno,
            })
    print(f"CSV: {len(rows)} rows ({'DRY-RUN - no writes' if dry_run else 'will write'})")
    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    ok = skipped = 0
    async with factory() as session:
        for row in rows:
            try:
                user_row = await _resolve_user(session, row["uid"])
                await _apply_updates(session, user_row, row["name"], row["email"], force, dry_run)
                ok += 1
            except ValueError as exc:
                skipped += 1
                print(f"  line {row['lineno']} ({row['uid']}): SKIPPED - {exc}")
    print(f"DONE: processed={ok}, skipped={skipped} (dry_run={dry_run})")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Recover PII encrypted with the lost PII_ENCRYPTION_KEY")
    parser.add_argument("--check", action="store_true", help="Report how many names/emails are currently readable")
    parser.add_argument("--list", action="store_true", help="List all users with current name/email state")
    parser.add_argument("--set", metavar="UID", help="Full user id or unambiguous id prefix (use --list for prefixes)")
    parser.add_argument("--name", help="Real name to store for the user")
    parser.add_argument("--email", help="Real email to store for the user (also recomputes email_hash)")
    parser.add_argument("--csv", metavar="FILE", help="Bulk restore from CSV with header uid,name,email")
    parser.add_argument("--dry-run", action="store_true", help="Preview --csv changes without writing")
    parser.add_argument("--force", action="store_true", help="Allow overwriting values that are already readable")
    args = parser.parse_args()

    if args.check:
        await check()
    elif args.list:
        await list_users()
    elif args.set:
        await set_user(args.set, args.name, args.email, args.force)
    elif args.csv:
        await csv_restore(args.csv, args.force, args.dry_run)
    else:
        parser.print_help()


asyncio.run(main())
