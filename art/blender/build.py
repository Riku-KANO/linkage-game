"""
工房の素材(GLB)を作り直す入口。`pnpm models`(scripts/models.mjs)から Blender で実行する。

  blender -b --factory-startup --python-use-system-env --python art/blender/build.py -- \
      --out public/models [--only room,logo] [--preview DIR]

素材ごとに空のシーンから組み立てて書き出す。--preview を付けると確認用の PNG も描く。
"""

from __future__ import annotations

import argparse
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import kit  # noqa: E402

#: id(src/scene/assets.ts の MODEL_MANIFEST のキー)→ モジュール名
MODELS = {
    "toolbox": "toolbox",
    "logo": "logo",
}


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="build.py")
    p.add_argument("--out", required=True)
    p.add_argument("--only", default="")
    p.add_argument("--preview", default="")
    args = p.parse_args(argv)
    ids = [s for s in args.only.split(",") if s] or list(MODELS)
    for mid in ids:
        if mid not in MODELS:
            print(f"unknown model: {mid}", file=sys.stderr)
            return 2
    for mid in ids:
        mod = importlib.import_module(MODELS[mid])
        kit.reset()
        model = mod.build()
        out = os.path.join(args.out, mod.FILE)
        model.export(out)
        st = model.stats()
        total = sum(v["corners"] for v in st.values())
        print(f"[models] {mid:10s} -> {mod.FILE} corners={total} {st}")
        if os.environ.get("MODELS_BREAKDOWN"):
            for name, n in model.breakdown():
                print(f"[models]    {name:24s} {n:6d}")
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            for name, eye, target, lens in getattr(mod, "PREVIEWS", []):
                kit.preview(os.path.join(args.preview, f"{mid}-{name}.png"), eye, target, lens)
    return 0


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    code = main(argv)
    sys.stdout.flush()
    # Blender の終了コードに反映する
    if code:
        sys.exit(code)
