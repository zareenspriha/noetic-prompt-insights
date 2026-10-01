"""Run with streamlit run src/prompt_insights/ui.py after editable installation."""

import json
from collections import Counter
import streamlit as st
from prompt_insights.core import generate, evaluate, aggregate, classify_sensitivity
from prompt_insights.providers import classify_prompt

st.set_page_config(page_title="Prompt Insights", layout="wide")
st.title("Prompt Insights · synthetic classroom lab")
st.caption("Seven-topic baseline. Topic labels describe text, not employee intent or performance.")
rows = generate()
counts = aggregate(rows)
st.bar_chart(counts)
st.subheader("Sensitivity labels — fictional classroom policy")
st.bar_chart(dict(Counter(classify_sensitivity(row["text"]) for row in rows)))
report = evaluate(rows)
st.metric("Family-held-out accuracy", f"{report['validation']['accuracy']:.1%}")
st.metric("Sensitivity held-out accuracy", f"{report['sensitivity']['validation']['accuracy']:.1%}")
st.caption(report["limitation"])
with st.expander("View synthetic corpus and evaluation"):
    st.dataframe(rows)
    st.json(report)
with st.form("classify"):
    text = st.text_area(
        "Prompt to classify", value="Please debug a python function.", max_chars=16000
    )
    mode = st.selectbox("Provider", ["mock", "openai", "anthropic"])
    consent = st.checkbox(
        "I authorize one paid request and sending this text to the selected provider."
    )
    submitted = st.form_submit_button("Classify once")
if submitted:
    try:
        st.session_state["classification"] = classify_prompt(text, mode=mode, allow_live=consent)
    except ValueError as exc:
        st.error(str(exc))
if "classification" in st.session_state:
    st.json(st.session_state["classification"])
st.download_button("Download baseline evaluation", json.dumps(report, indent=2), "evaluation.json")
st.subheader("Gateway NDJSON import")
st.caption(
    "Only synthetic redacted prompt text is accepted. Real event metadata can be counted without text."
)
file = st.file_uploader("Upload gateway export", type=["ndjson", "jsonl"])
if st.button("Validate and summarize upload", disabled=file is None):
    from prompt_insights.gateway import parse_ndjson, summarize_gateway

    try:
        st.session_state["gateway_summary"] = summarize_gateway(parse_ndjson(file.getvalue()))
    except ValueError:
        st.error("Invalid gateway export; no raw records displayed.")
if "gateway_summary" in st.session_state:
    st.json(st.session_state["gateway_summary"])
