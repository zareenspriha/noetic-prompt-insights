import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Masked } from "@/components/shared/masked";
import { RedactedText } from "@/components/classify/redacted-text";

describe("Masked", () => {
  it("draws each placeholder as a bar that screen readers announce, and never prints the tag", () => {
    const { container } = render(<Masked text="Offer for [NAME], base salary [REDACTED]" />);
    expect(screen.getByRole("img", { name: "name removed" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "secret removed" })).toBeInTheDocument();
    expect(container.textContent).toBe("Offer for , base salary ");
  });

  it("leaves text without placeholders alone", () => {
    const { container } = render(<Masked text="Summarize these server logs" />);
    expect(container.textContent).toBe("Summarize these server logs");
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("RedactedText", () => {
  it("highlights each risky span and lists the kinds found", () => {
    const text = "key sk-live-[REDACTED] here";
    render(<RedactedText text={text} spans={[{ start: 4, end: 22, kind: "api_key" }]} />);
    const mark = document.querySelector("mark");
    expect(mark).toHaveAttribute("title", "API key");
    expect(mark?.textContent).toBe("sk-live-");
    expect(screen.getByText("API key", { selector: "span" })).toBeInTheDocument();
  });

  it("survives overlapping or out-of-range spans from the backend", () => {
    render(
      <RedactedText
        text="abcdef"
        spans={[
          { start: 0, end: 4, kind: "email" },
          { start: 2, end: 99, kind: "phone" },
        ]}
      />,
    );
    expect(document.querySelectorAll("mark")).toHaveLength(2);
  });

  it("says so when nothing risky was found", () => {
    render(<RedactedText text="plain" spans={[]} />);
    expect(screen.getByText("No risky patterns found.")).toBeInTheDocument();
  });
});
