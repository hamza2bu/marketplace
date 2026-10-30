import { getTranslations } from "next-intl/server";
import type { DisputeMessage } from "@/server/admin/orders";

/** The messages of a dispute, oldest first. */
export async function DisputeThread({ messages, locale }: { messages: unknown; locale: string }) {
  const t = await getTranslations("admin.disputes.who");
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  return (
    <ol className="space-y-2">
      {(messages as DisputeMessage[]).map((m, i) => (
        <li key={i} className={`rounded-md p-2 text-sm ${m.by === "admin" ? "bg-brand/10" : "bg-surface"}`}>
          <p className="text-xs text-muted">
            {t(m.by)} · {dateTime.format(new Date(m.at))}
          </p>
          <p className="whitespace-pre-line">{m.text}</p>
        </li>
      ))}
    </ol>
  );
}
