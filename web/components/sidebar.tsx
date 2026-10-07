"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FlaskConical, Inbox, Scale, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoToggle } from "@/components/demo-toggle";
import { Logo } from "@/components/logo";
import { useReviewQueue } from "@/lib/api";

const GROUPS = [
  { label: "Insights", items: [{ href: "/", label: "Weekly Report", icon: BarChart3 }] },
  {
    label: "Classifier",
    items: [
      { href: "/classify", label: "Classify", icon: FlaskConical },
      { href: "/review", label: "Review Queue", icon: Inbox, badge: "review" as const },
      { href: "/models", label: "Model Comparison", icon: Scale },
    ],
  },
  { label: "Governance", items: [{ href: "/about", label: "Data & Trust", icon: ShieldCheck }] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: review } = useReviewQueue();

  return (
    <aside className="sticky top-0 z-10 flex shrink-0 flex-col gap-5 border-b border-white/5 bg-black/60 px-4 py-4 backdrop-blur md:h-screen md:w-64 md:border-b-0 md:border-r md:py-6">
      <Link href="/" className="flex items-center gap-2.5 px-2">
        <Logo />
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight">Prompt Insights</span>
          <span className="block text-xs text-muted-foreground">AI usage &amp; risk</span>
        </span>
      </Link>

      <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col md:gap-5 md:overflow-visible">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex gap-1 md:flex-col">
            <p className="hidden px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 md:block">
              {g.label}
            </p>
            {g.items.map(({ href, label, icon: Icon, ...rest }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              const count = "badge" in rest && review ? review.length : null;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground",
                    active && "bg-primary/10 text-foreground",
                  )}
                >
                  {active && (
                    <span className="absolute inset-y-1.5 left-0 hidden w-0.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)] md:block" />
                  )}
                  <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
                  {label}
                  {count !== null && count > 0 && (
                    <span className="ml-auto rounded-full bg-primary/15 px-1.5 text-[11px] font-medium text-primary tabular-nums">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="hidden md:mt-auto md:block">
        <DemoToggle />
      </div>
    </aside>
  );
}
