const LABEL: Record<string, string> = {
  REDACTED: "secret",
  NAME: "name",
  EMAIL: "email",
  PHONE: "phone number",
  DATE: "date",
  SALARY: "salary",
  CARD: "card number",
  SSN: "ID number",
};

/** Redacted text with each [TAG] placeholder drawn as a black bar, like a censored document.
 *  Screen readers hear what kind of thing was removed ("name removed"). */
export function Masked({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[A-Z_]+\])/).map((part, i) => {
        const tag = /^\[([A-Z_]+)\]$/.exec(part)?.[1];
        if (!tag) return part ? <span key={i}>{part}</span> : null;
        const what = LABEL[tag] ?? tag.toLowerCase().replace(/_/g, " ");
        return (
          <span
            key={i}
            role="img"
            aria-label={`${what} removed`}
            title={`${what} removed`}
            className="redaction"
            style={{ width: `${Math.max(2, part.length * 0.45)}em` }}
          />
        );
      })}
    </>
  );
}
