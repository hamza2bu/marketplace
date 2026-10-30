"use client";

import { useState } from "react";
import { ProductImage } from "@/components/catalog/product-image";

type Img = { id: string; url: string; alt: string | null };

export function Gallery({ images, title, labels }: { images: Img[]; title: string; labels: { gallery: string; showImage: string[] } }) {
  const [active, setActive] = useState(0);
  const current = images[active];

  return (
    <section aria-label={labels.gallery} className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-surface">
        {current && (
          <ProductImage
            src={current.url}
            alt={current.alt ?? title}
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        )}
      </div>
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={labels.showImage[i]}
                aria-current={i === active}
                className={`relative block size-16 overflow-hidden rounded-md border-2 sm:size-20 ${
                  i === active ? "border-brand" : "border-transparent"
                }`}
              >
                <ProductImage src={img.url} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
