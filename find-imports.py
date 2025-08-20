import os
import json
import re
from pathlib import Path

BASE_DIR = Path.cwd()
PACKAGES_DIR = BASE_DIR / "packages"

IMPORT_RE = re.compile(r"import[^'\"]*['\"]([^'\"]+)['\"]", re.DOTALL)
REQUIRE_RE = re.compile(r"require\(\s*['\"]([^'\"]+)['\"]\s*\)")

IGNORE_FILE_PATTERNS = (".test.ts", ".test.tsx", ".bench.ts")

NODE_BUILTINS = {
    'assert','buffer','child_process','cluster','console','constants','crypto','dgram','dns','domain',
    'events','fs','http','http2','https','inspector','module','net','os','path','perf_hooks','process',
    'punycode','querystring','readline','repl','stream','string_decoder','timers','tls','tty','url',
    'util','v8','vm','worker_threads','zlib'
}


def normalize_import(mod: str):
    if not mod or mod.startswith(".") or mod.startswith("/"):
        return None
    if mod.startswith("node:"):
        return None
    if mod.startswith("@"):  # scoped package
        parts = mod.split("/")
        return "/".join(parts[:2]) if len(parts) >= 2 else mod
    return mod.split("/")[0]


def find_imports_in_file(path: Path):
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return set(), set()

    used = set()
    suspicious = set()
    for m in IMPORT_RE.finditer(text):
        mod = m.group(1)
        name = normalize_import(mod)
        if name:
            used.add(name)
            if name in NODE_BUILTINS:
                suspicious.add(name)
    for m in REQUIRE_RE.finditer(text):
        mod = m.group(1)
        name = normalize_import(mod)
        if name:
            used.add(name)
            if name in NODE_BUILTINS:
                suspicious.add(name)
    return used, suspicious


def scan_package(pkg_dir: Path):
    pkg_json_path = pkg_dir / "package.json"
    if not pkg_json_path.exists():
        return None

    with pkg_json_path.open() as f:
        pkg_json = json.load(f)

    pkg_name = pkg_json.get("name", pkg_dir.name)

    declared = set(pkg_json.get("dependencies", {}).keys()) | set(
        pkg_json.get("devDependencies", {}).keys()
    )

    used = set()
    suspicious = set()

    for root, dirs, files in os.walk(pkg_dir):
        if "node_modules" in dirs:
            dirs.remove("node_modules")

        for file in files:
            if not (file.endswith(".ts") or file.endswith(".tsx")):
                continue
            if any(file.endswith(suffix) for suffix in IGNORE_FILE_PATTERNS):
                continue

            fpath = Path(root) / file
            u, s = find_imports_in_file(fpath)
            used |= u
            suspicious |= s

    unused = declared - used
    missing = used - declared

    return pkg_name, unused, missing, suspicious


def main():
    for pkg in sorted([p for p in PACKAGES_DIR.iterdir() if p.is_dir()]):
        result = scan_package(pkg)
        if not result:
            continue
        name, unused, missing, suspicious = result
        if unused:
            print(f"{name}: unused dependencies -> {sorted(unused)}")
        if missing:
            print(f"{name}: missing dependencies -> {sorted(missing)}")
        if suspicious:
            print(f"{name}: possible unprefixed node builtins -> {sorted(suspicious)}")


if __name__ == "__main__":
    main()
