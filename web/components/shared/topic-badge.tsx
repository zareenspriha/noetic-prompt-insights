import { TOPIC_COLOR, TOPIC_LABEL } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import type { Topic } from "@/types/api";

/** Topic pill tinted with the topic's chart color, so badges and charts match. */
export function TopicBadge({ topic, className }: { topic: Topic; className?: string }) {
  const color = TOPIC_COLOR[topic];
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", className)}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {TOPIC_LABEL[topic]}
    </span>
  );
}
