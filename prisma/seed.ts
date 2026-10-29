import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Role } from "../src/generated/prisma/client";
import { expandOptions } from "../src/lib/variants";
import { categories, products, shops, type SeedProduct } from "./seed-data";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function upsertUser(email: string, name: string, role: Role, passwordHash: string) {
  return db.user.upsert({
    where: { email },
    update: { name, role, status: "ACTIVE" },
    create: { email, name, role, passwordHash, emailVerified: new Date() },
  });
}

async function seedCategories() {
  const ids = new Map<string, string>();
  for (const [i, top] of categories.entries()) {
    const parent = await db.category.upsert({
      where: { slug: top.slug },
      update: { name: top.name, commissionBps: top.commissionBps ?? null, sortOrder: i },
      create: { slug: top.slug, name: top.name, commissionBps: top.commissionBps, sortOrder: i },
    });
    ids.set(top.slug, parent.id);
    for (const [j, child] of (top.children ?? []).entries()) {
      const row = await db.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, parentId: parent.id, sortOrder: j },
        create: { slug: child.slug, name: child.name, parentId: parent.id, sortOrder: j },
      });
      ids.set(child.slug, row.id);
    }
  }
  return ids;
}

async function seedProduct(p: SeedProduct, index: number, shopId: string, categoryId: string, brandId: string) {
  const variants = expandOptions(p.options);
  const prices = variants.map((_, i) => p.variantPrices?.[i] ?? p.price);
  const data = {
    shopId,
    categoryId,
    brandId,
    title: p.title,
    description: p.description,
    specs: p.specs,
    status: "ACTIVE" as const,
    isFeatured: p.featured ?? false,
    minPriceMinor: Math.min(...prices),
  };
  const product = await db.product.upsert({
    where: { slug: p.slug },
    update: data,
    create: { ...data, slug: p.slug },
  });

  // Re-create children so re-running the seed converges on seed-data.ts.
  await db.productImage.deleteMany({ where: { productId: product.id } });
  await db.productVariant.deleteMany({ where: { productId: product.id } });

  await db.productVariant.createMany({
    data: variants.map((attributes, i) => ({
      productId: product.id,
      sku: `${p.slug}-${i + 1}`.toUpperCase(),
      attributes,
      priceMinor: prices[i],
      compareAtMinor: p.compareAt ?? null,
      stock: 5 + ((index * 7 + i * 3) % 40),
      isDefault: i === 0,
    })),
  });
  await db.productImage.createMany({
    data: [1, 2, 3].map((n, position) => ({
      productId: product.id,
      url: `https://picsum.photos/seed/${p.slug}-${n}/800/800`,
      alt: p.title,
      position,
    })),
  });
}

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error("SEED_PASSWORD is not set (see .env.example)");
  const passwordHash = await bcrypt.hash(password, 12);

  await db.platformSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, globalCommissionBps: 1000, vatBps: 1800, currency: "ILS", returnWindowDays: 14 },
  });

  await upsertUser("admin@example.com", "מנהלת המערכת", "ADMIN", passwordHash);
  await upsertUser("customer@example.com", "דנה ישראלי", "CUSTOMER", passwordHash);

  const categoryIds = await seedCategories();

  const shopIds = new Map<string, string>();
  for (const s of shops) {
    const owner = await upsertUser(s.owner.email, s.owner.name, "SELLER", passwordHash);
    const data = {
      name: s.name,
      description: s.description,
      status: "APPROVED" as const,
      approvedAt: new Date(),
      legalName: s.legalName,
      taxId: s.taxId,
      businessAddress: { line1: "רחוב הדוגמה 1", city: s.city, country: "IL" },
      contactEmail: s.owner.email,
      contactPhone: "03-0000000",
    };
    const shop = await db.shop.upsert({
      where: { slug: s.slug },
      update: data,
      create: { ...data, slug: s.slug, ownerId: owner.id },
    });
    shopIds.set(s.key, shop.id);
  }

  const brandIds = new Map<string, string>();
  for (const name of new Set(products.map((p) => p.brand))) {
    const slug = name.toLowerCase();
    const brand = await db.brand.upsert({ where: { slug }, update: { name }, create: { name, slug } });
    brandIds.set(name, brand.id);
  }

  for (const [i, p] of products.entries()) {
    const shopId = shopIds.get(p.shop);
    const categoryId = categoryIds.get(p.category);
    if (!shopId || !categoryId) throw new Error(`Unknown shop or category for ${p.slug}`);
    await seedProduct(p, i, shopId, categoryId, brandIds.get(p.brand)!);
  }

  const banner = {
    imageUrl: "https://picsum.photos/seed/hero-banner/1600/600",
    title: { he: "מבצעי סוף העונה", ar: "عروض نهاية الموسم", en: "End of season deals" },
    subtitle: { he: "עד 30% הנחה", ar: "خصم حتى 30%", en: "Up to 30% off" },
    linkUrl: "/deals",
  };
  if (!(await db.banner.findFirst({ where: { placement: "home-hero" } }))) {
    await db.banner.create({ data: banner });
  }

  const counts = await Promise.all([db.user.count(), db.shop.count(), db.category.count(), db.product.count(), db.productVariant.count()]);
  console.log(`Seeded: ${counts[0]} users, ${counts[1]} shops, ${counts[2]} categories, ${counts[3]} products, ${counts[4]} variants`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
