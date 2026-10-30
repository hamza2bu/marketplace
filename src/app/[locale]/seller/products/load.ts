import "server-only";
import { localized } from "@/lib/i18n-text";
import { minorToInput } from "@/lib/money";
import { optionAxes } from "@/lib/variant-options";
import type { ProductFormValues } from "@/components/seller/product-form";
import { getSellerProduct, leafCategories } from "@/server/seller/products";

export async function categoryOptions(locale: string) {
  return (await leafCategories()).map((c) => ({
    id: c.id,
    label: localized(c.name, locale),
    group: c.parent ? localized(c.parent.name, locale) : "",
  }));
}

export const emptyProduct: ProductFormValues = {
  title: "",
  slug: "",
  categoryId: "",
  brandName: "",
  description: "",
  images: [],
  specs: [],
  options: [],
  variants: [{ attributes: {}, sku: "", price: "", compareAt: "", stock: "0", isActive: true }],
};

export async function productFormValues(shopId: string, productId: string): Promise<ProductFormValues | null> {
  const p = await getSellerProduct(shopId, productId);
  if (!p) return null;
  const variants = p.variants.map((v) => ({ ...v, attributes: v.attributes as Record<string, string> }));
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    categoryId: p.categoryId,
    brandName: p.brand?.name ?? "",
    description: p.description,
    status: p.status,
    images: p.images.map((i) => ({ url: i.url, alt: i.alt ?? "" })),
    specs: Object.entries((p.specs ?? {}) as Record<string, string>).map(([key, value]) => ({ key, value })),
    options: optionAxes(variants).map((a) => ({ name: a.name, values: a.values.join(", ") })),
    variants: variants.map((v) => ({
      id: v.id,
      attributes: v.attributes,
      sku: v.sku,
      price: minorToInput(v.priceMinor),
      compareAt: minorToInput(v.compareAtMinor),
      stock: String(v.stock),
      isActive: v.isActive,
    })),
  };
}
