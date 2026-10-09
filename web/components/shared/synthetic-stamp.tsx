/** Rubber-stamp label so nobody mistakes demo numbers for real ones, on screen or in the PDF. */
export function SyntheticStamp({ children = "Synthetic data" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-block -rotate-3 rounded-md border-2 border-sev-critical px-2.5 py-0.5 text-[13px] font-bold tracking-wide text-sev-critical uppercase">
      {children}
    </span>
  );
}
