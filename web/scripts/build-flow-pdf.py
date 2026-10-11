"""Bundle screenshots/ (from capture-flow-screens.mjs) into one PDF, ordered by user flow.

Usage: python scripts/build-flow-pdf.py   (from web/)
"""
import io
import json
import re
from datetime import date
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "screenshots"
OUT = SHOTS / "Onramp_User_Flow_Screenshots.pdf"

FLOWS = {
    "F1": "New developer onboarding (core loop)",
    "F2": "Auth & invite",
    "F3": "Repo Autopilot pipeline",
    "F4": "Billing & wallet",
    "F5": "API keys & BYOK",
    "F7": "Public discovery (SEO)",
    "Other": "Other product pages",
}
ROLES = [  # folder -> section title, in the order the PDF presents them
    ("00_public", "Public pages"),
    ("ceo", "CEO"),
    ("cto", "CTO"),
    ("admin", "Org admin"),
    ("hr", "HR"),
    ("senior1", "Senior developer one"),
    ("senior2", "Senior developer two"),
    ("junior1", "Junior developer one"),
    ("junior2", "Junior developer two"),
    ("junior3", "Junior developer three"),
    ("junior4", "Junior developer four"),
]
SECTIONS = [
    (f, t, "Logged out visitor" if f == "00_public" else f"{f}@foundation.dev")
    for f, t in ROLES
    if (SHOTS / f).is_dir() and any((SHOTS / f).glob("*.png"))
]
CAPTURE = Path(__file__).with_name("capture-flow-screens.mjs")

INK = HexColor("#16181d")
MUTED = HexColor("#6b6f76")
ACCENT = HexColor("#0f6b54")
RULE = HexColor("#d9d6cf")
PAPER = HexColor("#f4f2ed")

W, H = landscape(A4)
M = 28  # margin
HEADER = 46
IMG_W = W - 2 * M
IMG_H = H - 2 * M - HEADER - 14


def route_table():
    """[(section, flow, route, label)] in capture order, parsed from capture-flow-screens.mjs."""
    src = CAPTURE.read_text(encoding="utf8")
    out = []
    for block, key in (("PUBLIC", "public"), ("APP", "app")):
        body = re.search(rf"const {block} = \[(.*?)\n\];", src, re.S).group(1)
        for flow, route, label in re.findall(r"\['(\w+)', '([^']+)', '([^']+)'\]", body):
            out.append((key, flow, route, label))
    return out


def route_map():
    """file name|folder -> route, from the capture script's table plus any capture logs."""
    routes = {}
    table = route_table()
    for folder, *_ in SECTIONS:
        key = "public" if folder == "00_public" else "app"
        rows = [r for r in table if r[0] == key]
        for i, (_, flow, route, label) in enumerate(rows):
            routes[f"{i + 1:02d}_{flow}_{label}.png|{folder}"] = route
    for f in SHOTS.glob("index*.json"):
        for entries in json.loads(f.read_text()).values():
            for e in entries:
                if e.get("file"):
                    routes[Path(e["file"].replace("\\", "/")).name + "|" + Path(e["file"].replace("\\", "/")).parent.name] = e["route"]
    return routes


def parse(name):
    m = re.match(r"(\d+)_(F\d|Other)_(.+)\.png", name)
    fixed = {"pr-describe": "PR Describe", "soc-2": "SOC 2", "dpa": "DPA", "404": "404 Not Found"}
    return m.group(2), fixed.get(m.group(3), m.group(3).replace("-", " ").title())


def quiet_row(gray, lo, hi):
    """Lowest row in [lo, hi) of the content area (right of the sidebar) that is one flat colour."""
    w = gray.width
    x0 = int(w * 0.16)  # skip the app sidebar, it runs the full height
    for y in range(hi - 1, lo - 1, -1):
        row = gray.crop((x0, y, w, y + 1))
        mn, mx = row.getextrema()
        if mx - mn <= 6:
            return y
    return None


def slices(img):
    """Cut a tall full-page screenshot into page-sized chunks, breaking only on blank rows
    so no card, table row or line of text is split across two PDF pages."""
    chunk = int(img.width * IMG_H / IMG_W)
    if img.height <= chunk * 1.15:  # a little over one page: shrink to fit rather than cut
        yield img
        return
    gray = img.convert("L")
    top = 0
    while top < img.height:
        if img.height - top <= chunk * 1.15:
            yield img.crop((0, top, img.width, img.height))
            return
        cut = quiet_row(gray, top + int(chunk * 0.6), top + chunk) or top + chunk
        yield img.crop((0, top, img.width, cut))
        top = cut


def jpeg(img):
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=85, optimize=True)
    buf.seek(0)
    return ImageReader(buf)


def footer(c, page_no):
    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    c.drawString(M, 14, "Onramp 2.0 · User flow screenshots")
    c.drawRightString(W - M, 14, str(page_no))


def cover(c, counts):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(ACCENT)
    c.rect(M, H - 150, 46, 4, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 34)
    c.drawString(M, H - 195, "Onramp 2.0")
    c.setFont("Helvetica", 20)
    c.drawString(M, H - 225, "User flow screenshots")
    c.setFont("Helvetica", 10.5)
    c.setFillColor(MUTED)
    c.drawString(M, H - 250, f"Captured {date.today():%d %B %Y}  ·  1440px desktop  ·  local build (web :5173, api :8000)")

    y = H - 310
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(INK)
    c.drawString(M, y, "Sections")
    c.drawString(W / 2, y, "User flows (docs/figma-kit/userflows.mmd)")
    c.setFont("Helvetica", 10)
    for i, (folder, title, who) in enumerate(SECTIONS):
        c.setFillColor(INK)
        c.drawString(M, y - 20 - i * 17, f"{title}")
        c.setFillColor(MUTED)
        c.drawString(M + 120, y - 20 - i * 17, f"{who}  ·  {counts[folder]} screens")
    for i, (k, v) in enumerate(FLOWS.items()):
        c.setFillColor(ACCENT)
        c.drawString(W / 2, y - 20 - i * 17, k)
        c.setFillColor(INK)
        c.drawString(W / 2 + 40, y - 20 - i * 17, v)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(MUTED)
    c.drawString(M, 40, "F6 (review pipeline) is a task state machine, shown through the Tasks and Review Queue screens.")
    c.drawString(M, 28, "Routes a role cannot open (the app redirects them) are listed at the start of that role's section.")


def divider(c, title, who, n, gated, page_no):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(ACCENT)
    c.rect(M, H / 2 + 60, 46, 4, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 28)
    c.drawString(M, H / 2 + 20, title)
    c.setFont("Helvetica", 12)
    c.setFillColor(MUTED)
    c.drawString(M, H / 2 - 4, f"{who}  ·  {n} screens")
    if gated:
        c.setFont("Helvetica-Bold", 9.5)
        c.setFillColor(INK)
        c.drawString(M, H / 2 - 50, "Not accessible to this role (redirected):")
        c.setFont("Helvetica", 9.5)
        c.setFillColor(MUTED)
        line, y = "", H / 2 - 66
        for g in gated:
            piece = (", " if line else "") + g
            if c.stringWidth(line + piece, "Helvetica", 9.5) > W - 2 * M:
                c.drawString(M, y, line)
                line, y = g, y - 14
            else:
                line += piece
        c.drawString(M, y, line)
    footer(c, page_no)


def gated_routes(folder):
    """Routes in the table with no screenshot: the role was redirected away."""
    key = "public" if folder == "00_public" else "app"
    rows = [r for r in route_table() if r[0] == key]
    have = {p.name for p in (SHOTS / folder).glob("*.png")}
    missing = [route for i, (_, flow, route, label) in enumerate(rows) if f"{i + 1:02d}_{flow}_{label}.png" not in have]
    if missing:
        return missing
    out = []
    for f in SHOTS.glob("index*.json"):
        data = json.loads(f.read_text())
        key = "public" if folder == "00_public" else folder
        for e in data.get(key, []):
            if e.get("redirected"):
                out.append(f"{e['route']} -> {e['landed']}")
    return list(dict.fromkeys(out))  # capture logs from separate runs overlap


def main():
    routes = route_map()
    files = {s[0]: sorted((SHOTS / s[0]).glob("*.png")) for s in SECTIONS}
    c = canvas.Canvas(str(OUT), pagesize=(W, H))
    c.setTitle("Onramp 2.0 - User flow screenshots")
    c.setAuthor("Onramp")
    cover(c, {k: len(v) for k, v in files.items()})
    c.showPage()
    page_no = 2

    for folder, title, who in SECTIONS:
        divider(c, title, who, len(files[folder]), gated_routes(folder), page_no)
        c.showPage()
        page_no += 1
        c.bookmarkPage(folder)
        c.addOutlineEntry(title, folder, level=0)

        for f in files[folder]:
            flow, label = parse(f.name)
            route = routes.get(f"{f.name}|{folder}", "")  # post-login shot isn't in the capture log
            if f.name.startswith("00_F2_post-login"):
                label, route = "After login (landing screen)", "/login -> home"
            parts = list(slices(Image.open(f)))
            key = f"{folder}-{f.stem}"
            c.bookmarkPage(key)
            c.addOutlineEntry(f"{flow} · {label}", key, level=1)
            for i, part in enumerate(parts):
                # header
                c.setFillColor(ACCENT)
                c.setFont("Helvetica-Bold", 9)
                c.drawString(M, H - M - 10, f"{flow}  ·  {FLOWS[flow].upper()}")
                c.setFillColor(INK)
                c.setFont("Helvetica-Bold", 16)
                cont = f"  ({i + 1}/{len(parts)})" if len(parts) > 1 else ""
                title_txt = label + cont
                room = W - 2 * M - c.stringWidth(route, "Courier", 9.5) - 24
                while c.stringWidth(title_txt, "Helvetica-Bold", 16) > room and len(title_txt) > 4:
                    title_txt = title_txt[:-2]
                c.drawString(M, H - M - 30, title_txt)
                c.setFont("Courier", 9.5)
                c.setFillColor(MUTED)
                c.drawRightString(W - M, H - M - 10, title)
                c.drawRightString(W - M, H - M - 30, route)
                c.setStrokeColor(RULE)
                c.line(M, H - M - HEADER + 6, W - M, H - M - HEADER + 6)
                # image, fit into frame
                scale = min(IMG_W / part.width, IMG_H / part.height)
                w, h = part.width * scale, part.height * scale
                x, y = M + (IMG_W - w) / 2, H - M - HEADER - h
                c.drawImage(jpeg(part), x, y, w, h)
                c.setStrokeColor(RULE)
                c.rect(x, y, w, h, stroke=1, fill=0)
                footer(c, page_no)
                c.showPage()
                page_no += 1

    c.save()
    print(f"{OUT}  ({page_no - 1} pages, {OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
