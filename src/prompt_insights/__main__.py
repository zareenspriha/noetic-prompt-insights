import argparse
import json
from pathlib import Path
from .core import MIN_DISTINCT_USERS, MIN_GROUP_SIZE, WINDOWS, aggregate, evaluate, generate


def main(argv=None):
    parser = argparse.ArgumentParser(description="Synthetic prompt insights starter")
    commands = parser.add_subparsers(dest="command", required=True)
    demo = commands.add_parser("demo")
    demo.add_argument("--out", type=Path, default=Path("artifacts/demo"))
    cmp = commands.add_parser("compare")
    cmp.add_argument("--out", type=Path, default=Path("artifacts/compare.json"))
    serve = commands.add_parser("serve")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8001)
    imp = commands.add_parser("import-gateway")
    imp.add_argument("--input", type=Path)
    imp.add_argument("--url", default="http://127.0.0.1:8000")
    imp.add_argument("--out", type=Path, default=Path("artifacts/gateway-summary.json"))
    imp.add_argument("--window", choices=WINDOWS, default="week")
    imp.add_argument("--min-group-size", type=int, default=MIN_GROUP_SIZE)
    imp.add_argument("--min-distinct-users", type=int, default=MIN_DISTINCT_USERS)
    live = commands.add_parser("eval-provider", help="Task 5: one paid call per frozen row")
    live.add_argument("--input", type=Path, required=True)
    live.add_argument("--split", help="only rows whose split field equals this, e.g. test")
    live.add_argument("--mode", choices=["openai", "anthropic"], required=True)
    live.add_argument("--yes", action="store_true", help="authorize one paid request per row")
    live.add_argument("--out", type=Path, required=True, help="e.g. data/llm-results/...")
    batch = commands.add_parser("label-events", help="LLM labels for the report's model=llm")
    batch.add_argument("--input", type=Path, default=Path("data/demo-events.ndjson"))
    batch.add_argument("--mode", choices=["openai", "anthropic"], required=True)
    batch.add_argument("--yes", action="store_true", help="authorize one paid request per text")
    batch.add_argument("--out", type=Path, default=Path("data/llm-results/llm-event-labels.json"))
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
    elif args.command == "eval-provider":
        from .providers import dataset_fingerprint, evaluate_provider

        try:
            data = args.input.read_bytes()
            meta_path = args.input.with_name(args.input.stem + ".meta.json")
            meta = json.loads(meta_path.read_text()) if meta_path.exists() else None
            rows = [json.loads(line) for line in data.splitlines() if line.strip()]
            rows = [r for r in rows if args.split is None or r.get("split") == args.split]
            if not rows:
                raise ValueError("No rows selected")
            result = dict(
                dataset=dict(
                    path=str(args.input),
                    sha256=dataset_fingerprint(data, meta),
                    frozen=meta is not None,
                    split=args.split,
                ),
                **evaluate_provider(rows, args.mode, allow_live=args.yes),
            )
        except (ValueError, OSError) as error:
            parser.exit(2, f"Provider evaluation failed: {error}\n")
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n")
        print(f"Classified {result['answered']}/{result['rows']} rows; wrote {args.out}.")
    elif args.command == "label-events":
        from .gateway import MAX_BYTES, parse_ndjson
        from .providers import label_events

        try:
            with args.input.open("rb") as stream:
                events = parse_ndjson(stream.read(MAX_BYTES + 1))
            result = label_events(events, args.mode, allow_live=args.yes)
        except (ValueError, OSError) as error:
            parser.exit(2, f"Labelling failed: {error}\n")
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n")
        print(
            f"Labelled {len(result['labels'])} events with {result['calls']} calls; wrote {args.out}."
        )
    else:
        from .gateway import parse_ndjson, fetch_gateway, summarize_gateway, MAX_BYTES

        try:
            if args.input:
                with args.input.open("rb") as stream:
                    events = parse_ndjson(stream.read(MAX_BYTES + 1))
            else:
                events = fetch_gateway(args.url)
            result = summarize_gateway(
                events,
                window=args.window,
                min_group_size=args.min_group_size,
                min_distinct_users=args.min_distinct_users,
            )
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
