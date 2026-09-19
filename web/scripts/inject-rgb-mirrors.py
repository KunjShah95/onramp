"""One-off codemod for web/src/index.css.

Injects `--<name>-rgb: R G B;` channel mirrors for every hex-var token
(--room, --base, --panel, --panel-raised, --well, --inset, --ink,
--ink-secondary, --ink-tertiary, --ink-muted, --ink-disabled, --go,
--go-lit, --mission, --mission-lit, --caution, --caution-lit, --abort,
--abort-lit) into each theme block (:root, [data-theme=...],
.landing-premium, .landing-light, and the .landing-mode-light pre-paint
guard).

Why: Tailwind's `bg-panel/50` compiles to `rgb(var(--panel) / 0.5)`, which
is invalid CSS when --panel holds a hex string — the declaration silently
drops. Mirrors let the config point those utilities at
`rgb(var(--panel-rgb) / <alpha>)` so opacity modifiers work everywhere.
"""

import re
import sys

CSS_PATH = "src/index.css"

# Token name -> mirror var suffix. --seam/--seam-strong are rgba() strings:
# they are NOT mirrored (a triplet mirror would break the opaque rgba()
# usage in .glass/.nexora-glass etc.) — their alpha call sites are
# rewritten in TS instead.
MIRRORS = [
    "room", "base", "panel", "panel-raised", "well", "inset",
    "ink", "ink-secondary", "ink-tertiary", "ink-muted", "ink-disabled",
    "go", "go-lit", "mission", "mission-lit",
    "caution", "caution-lit", "abort", "abort-lit",
]

HEX_RE = re.compile(r"^([0-9A-Fa-f]{6})$")
BLOCK_RE = re.compile(
    r"(?P<head>(?:^  :root \{|\[data-theme='[a-z-]+'\] \{|\.landing-premium \{|"
    r"\.landing-light \{|\.landing-mode-light \.landing-premium:not\(\.landing-light\) \{))"
)


def hex_to_triplet(h: str) -> str:
    return " ".join(str(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def main() -> int:
    with open(CSS_PATH, "r", encoding="utf-8") as f:
        lines = f.readlines()

    out: list[str] = []
    i = 0
    injected_blocks = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = BLOCK_RE.search(line)
        if m:
            # Inside this block: find each target var and its hex value,
            # and remember the line index of the last one we mirror.
            found: dict[str, tuple[str, int]] = {}  # token -> (hex, line_idx)
            j = i + 1
            depth = 1
            while j < len(lines) and depth > 0:
                l2 = lines[j]
                if l2.strip() == "}":
                    depth -= 1
                    if depth == 0:
                        break
                    j += 1
                    continue
                dm = re.match(r"\s*--([a-z0-9-]+):\s*(#?)([0-9A-Fa-f]{6})\s*(;.*)$", l2)
                if dm and dm.group(1) in MIRRORS and not dm.group(1).endswith("-rgb"):
                    found[dm.group(1)] = (dm.group(3), j)
                j += 1

            if found:
                anchor = max(idx for _, idx in found.values())
                # Emit everything up to and including the anchor line.
                while i < anchor:
                    i += 1
                    out.append(lines[i])
                # Inject mirrors sorted by the MIRRORS order for stable diffs.
                out.append("\n")
                out.append("    /* RGB channel mirrors — fed to Tailwind so alpha")
                out.append("       modifiers (/50, /[0.09]) work on these tokens. */")
                for token in MIRRORS:
                    if token in found:
                        hexv = found[token][0]
                        if not HEX_RE.match(hexv):
                            print(f"SKIP non-hex {token}={hexv}", file=sys.stderr)
                            continue
                        out.append(f"    --{token}-rgb: {hex_to_triplet(hexv)};")
                out.append("\n")
                injected_blocks += 1
            i += 1
            continue
        i += 1

    with open(CSS_PATH, "w", encoding="utf-8") as f:
        f.writelines(out)

    print(f"Injected mirrors into {injected_blocks} blocks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
