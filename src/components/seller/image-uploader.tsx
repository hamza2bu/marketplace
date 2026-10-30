"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ProductImage } from "@/components/catalog/product-image";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/images";
import { prepareImageUploadAction } from "@/app/actions/uploads";

export type UploadedImage = { url: string; alt: string };

/** Uploads one image to wherever the server says (Cloudinary or local dev storage). */
export async function uploadImage(file: File): Promise<{ url: string } | { error: "too_large" | "bad_type" | "failed" | "off" }> {
  if (file.size > MAX_IMAGE_BYTES) return { error: "too_large" };
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) return { error: "bad_type" };
  const target = await prepareImageUploadAction();
  if (target.kind === "none") return { error: "off" };
  const body = new FormData();
  for (const [k, v] of Object.entries(target.fields)) body.append(k, v);
  body.append("file", file);
  try {
    const res = await fetch(target.url, { method: "POST", body });
    const data = (await res.json()) as { url?: string; secure_url?: string; error?: string | { message: string } };
    const url = data.secure_url ?? data.url;
    if (!res.ok || !url) return { error: data.error === "bad_type" ? "bad_type" : data.error === "too_large" ? "too_large" : "failed" };
    return { url };
  } catch {
    return { error: "failed" };
  }
}

export function ImageUploader({ images, onChange, max = 10 }: { images: UploadedImage[]; onChange: (images: UploadedImage[]) => void; max?: number }) {
  const t = useTranslations("seller.form");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErrors([]);
    const added: UploadedImage[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files).slice(0, max - images.length)) {
      const result = await uploadImage(file);
      if ("url" in result) added.push({ url: result.url, alt: "" });
      else if (result.error === "off") problems.push(t("uploadsOff"));
      else {
        const reason = result.error === "too_large" ? t("uploadTooLarge") : result.error === "bad_type" ? t("uploadBadType") : t("uploadError");
        problems.push(t("uploadFailed", { name: file.name, reason }));
      }
    }
    onChange([...images, ...added]);
    setErrors([...new Set(problems)]);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {images.map((img, i) => (
            <li key={img.url} className={`relative overflow-hidden rounded-md border-2 ${i === 0 ? "border-brand" : "border-border"}`}>
              <div className="relative aspect-square bg-surface">
                <ProductImage src={img.url} alt="" fill sizes="120px" className="object-cover" />
              </div>
              <div className="flex justify-between gap-1 bg-background p-1 text-xs">
                {i > 0 ? (
                  <button type="button" onClick={() => onChange([img, ...images.filter((_, j) => j !== i)])} className="text-brand underline">
                    {t("makeMain")}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  aria-label={t("removeImage")}
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                  className="px-1 text-danger"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {images.length < max && (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm hover:border-brand">
          <input
            ref={input}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
          />
          {busy ? t("uploading") : t("upload")}
        </label>
      )}
      <p className="text-xs text-muted">{t("imagesHint")}</p>
      {errors.map((e) => (
        <p key={e} role="alert" className="text-sm text-danger">
          {e}
        </p>
      ))}
    </div>
  );
}
