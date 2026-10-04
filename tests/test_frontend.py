from pathlib import Path
import shutil
import subprocess


def test_frontend_regressions():
    node = shutil.which("node")
    assert node, "Node.js 18 or newer is required for frontend regression tests"
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [node, "--test", str(root / "tests" / "frontend.test.cjs")],
        cwd=root,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert result.returncode == 0, result.stdout + result.stderr
