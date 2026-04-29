from pathlib import Path
import ast

ROOT = Path(__file__).resolve().parents[1]
required = [
    "apps/web/package.json",
    "apps/web/src/App.tsx",
    "apps/web/src/components/LocalPoseCoach.tsx",
    "services/api/app/main.py",
    "services/api/app/routers/auth.py",
    "services/api/app/routers/sessions.py",
]

missing = [item for item in required if not (ROOT / item).exists()]
if missing:
    raise SystemExit(f"Missing files: {missing}")

for py_file in (ROOT / "services/api/app").rglob("*.py"):
    ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))

print("Smoke check passed: required files exist and Python files parse.")
