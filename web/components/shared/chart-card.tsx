import { cn } from "@/lib/utils";

/** Card wrapper for every chart. `description` doubles as the chart's accessible label. */
export function ChartCard({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={description ? `${title}: ${description}` : title} className={cn("panel min-w-0 p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-medium tracking-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
