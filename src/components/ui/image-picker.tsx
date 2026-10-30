"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ProductImage } from "@/components/catalog/product-image";
import { uploadImage } from "@/components/seller/image-uploader";

/** A single uploaded image with a preview, submitted as a hidden field named `name`. */
export function ImagePicker({ name, label, initial, wide }: { name: string; label: string; initial: string | null; wide?: boolean }) {
  const t = useTranslations("seller.settings");
  const form = useTranslations("seller.form");
  const [url, setUrl] = useState(initial ?? "");
  const [error, setError] = useState("");
  return (
    <div className="space-y-1 text-sm">
      <span className="block font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <div className={`relative overflow-hidden rounded-md bg-surface ${wide ? "h-16 w-48" : "size-16"}`}>
          {url && <ProductImage src={url} alt="" fill sizes="192px" className="object-cover" />}
        </div>
        <label className="cursor-pointer rounded-md border border-border px-3 py-1.5">
          {t("changeImage")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError("");
              const result = await uploadImage(file);
              if ("url" in result) setUrl(result.url);
              else setError(result.error === "off" ? form("uploadsOff") : form("uploadFailed", { name: file.name, reason: form("uploadError") }));
            }}
          />
        </label>
      </div>
      <input type="hidden" name={name} value={url} />
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

