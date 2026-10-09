"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FlaskConical, Inbox, Scale, ShieldCheck, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoToggle } from "@/components/demo-toggle";
import { useReviewQueue } from "@/lib/api";

const GROUPS = [
  { label: "Insights", items: [{ href: "/", label: "Weekly report", icon: BarChart3 }] },
  {
    label: "Classifier",
    items: [
      { href: "/classify", label: "Classify a prompt", icon: FlaskConical },
      { href: "/review", label: "Review queue", icon: Inbox, badge: "review" as const },
      { href: "/models", label: "Model comparison", icon: Scale },
      { href: "/challenge", label: "Beat the detector", icon: Swords },
    ],
  },
  { label: "Governance", items: [{ href: "/about", label: "Data and trust", icon: ShieldCheck }] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: review } = useReviewQueue();

  return (
    <aside className="sticky top-0 z-10 flex shrink-0 flex-col gap-5 border-b border-border bg-secondary px-4 py-4 md:h-screen md:w-64 md:border-b-0 md:border-r md:py-7">
      <Link href="/" className="px-2 text-foreground no-underline">
        {/* The wordmark carries the product's own idea: part of it is blacked out. */}
        <span className="block font-serif text-2xl font-medium tracking-tight">
          Prompt <span className="redaction mx-0 text-ink">Insig</span>hts
        </span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">What people ask AI, minus the secrets</span>
      </Link>

      <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col md:gap-5 md:overflow-visible">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex gap-1 md:flex-col">
            <p className="hidden px-3 pb-1 text-[13px] text-muted-foreground md:block">{g.label}</p>
            {g.items.map(({ href, label, icon: Icon, ...rest }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              const count = "badge" in rest && review ? review.length : null;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[15px] transition-colors",
                    active ? "bg-ink text-white" : "text-foreground hover:bg-foreground/[0.05]",
                  )}
                >
                  <Icon className={cn("size-4", active ? "text-white" : "text-muted-foreground")} aria-hidden />
                  {label}
                  {count !== null && count > 0 && (
                    <span
                      className={cn(
                        "ml-auto min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums",
                        active ? "bg-white/20 text-white" : "bg-[#dcd6ee] text-foreground",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="hidden flex-col gap-3 md:mt-auto md:flex">
        <p className="flex items-center gap-2.5 px-3 text-[13px] text-muted-foreground">
          Built for
          <Image src="/noetic-logo.png" alt="Noetic" width={102} height={22} className="h-[22px] w-auto" />
        </p>
        <DemoToggle />
      </div>
    </aside>
  );
}
