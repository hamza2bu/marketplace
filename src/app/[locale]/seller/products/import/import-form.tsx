"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/ui/use-error-text";
import { importCsvAction, type ImportState } from "../actions";

export function ImportForm() {
  const t = useTranslations("seller.import");
  const locale = useLocale();
  const err = useErrorText();
  const [state, action, pending] = useActionState<ImportState, FormData>(importCsvAction, {});

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="locale" value={locale} />
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("file")}</span>
          <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm" />
        </label>
        <button disabled={pending} className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60">
          {pending ? t("importing") : t("submit")}
        </button>
      </form>

      {state.done && (
        <div role="status" className="space-y-3">
          {state.created !== undefined && (
            <p className="font-medium">{t("result", { created: state.created, updated: state.updated ?? 0, failed: state.failed ?? 0 })}</p>
          )}
          {state.errors && state.errors.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="w-16 p-1 text-start font-medium">{t("row")}</th>
                  <th className="p-1 text-start font-medium">{t("problem")}</th>
                </tr>
              </thead>
              <tbody>
                {state.errors.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-1">{e.row || "—"}</td>
                    <td className="p-1 text-danger">
                      {err(e.message, { detail: e.detail ?? "", sku: e.detail ?? "" })}
                      {e.detail && !["csvMissingColumns", "csvUnknownCategory", "sku_taken"].includes(e.message) && (
                        <span className="text-muted" dir="ltr">
                          {" "}
                          ({e.detail})
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
