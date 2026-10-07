import argparse
import json
from pathlib import Path
from .core import generate, evaluate, aggregate


def main(argv=None):
    parser = argparse.ArgumentParser(description="Synthetic prompt insights starter")
    commands = parser.add_subparsers(dest="command", required=True)
    demo = commands.add_parser("demo")
    demo.add_argument("--out", type=Path, default=Path("artifacts/demo"))
    cmp = commands.add_parser("compare")
    cmp.add_argument("--out", type=Path, default=Path("artifacts/compare.json"))
    serve = commands.add_parser("serve")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    imp = commands.add_parser("import-gateway")
    imp.add_argument("--input", type=Path)
    imp.add_argument("--url", default="http://127.0.0.1:8000")
    imp.add_argument("--out", type=Path, default=Path("artifacts/gateway-summary.json"))
    args = parser.parse_args(argv)
    if args.command == "demo":
        args.out.mkdir(parents=True, exist_ok=True)
        rows = generate()
        (args.out / "prompts.ndjson").write_text("".join(json.dumps(row) + "\n" for row in rows))
        (args.out / "evaluation.json").write_text(json.dumps(evaluate(rows), indent=2) + "\n")
        (args.out / "topic-counts.json").write_text(json.dumps(aggregate(rows), indent=2) + "\n")
        print("Generated 280 synthetic prompts and a family-disjoint baseline evaluation.")
    elif args.command == "serve":
        import uvicorn

        uvicorn.run("prompt_insights.api:app", host=args.host, port=args.port)
    elif args.command == "compare":
        from .model import compare

        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(compare(generate()), indent=2) + "\n")
        print(f"Compared keyword, TF-IDF and k-NN models; wrote {args.out}.")
    else:
        from .gateway import parse_ndjson, fetch_gateway, summarize_gateway, MAX_BYTES

        try:
            if args.input:
                with args.input.open("rb") as stream:
                    events = parse_ndjson(stream.read(MAX_BYTES + 1))
            else:
                events = fetch_gateway(args.url)
            result = summarize_gateway(events)
        except (ValueError, OSError):
            parser.exit(
                2, "Gateway import failed: check contract, authentication, and input size.\n"
            )
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n")
        print("Validated gateway events; wrote text-free aggregate summary.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
