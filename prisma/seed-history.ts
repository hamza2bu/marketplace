// Sample order history for local development: paid, shipped and delivered
// orders over the last 60 days, the matching ledger entries, and reviews from
// the buyers. Re-running replaces it (orders are numbered SEED-…).
import type { PrismaClient, Role } from "../src/generated/prisma/client";
import { deriveOrderStatus } from "../src/lib/order-status";
import { resolveCommissionBps, splitOrder } from "../src/lib/pricing";
import { products as seedProducts } from "./seed-data";

const SEED_SLUGS = seedProducts.map((p) => p.slug);

const DAY = 86_400_000;

/** Small deterministic PRNG, so the seed gives the same data every time. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = [
  { email: "customer@example.com", name: "דנה ישראלי" },
  { email: "noa@example.com", name: "נועה כהן" },
  { email: "ahmad@example.com", name: "אחמד חורי" },
  { email: "yael@example.com", name: "יעל לוי" },
  { email: "mohammad@example.com", name: "מוחמד עבאס" },
];

const REVIEWS: Record<number, { title: string; body: string }[]> = {
  5: [
    { title: "מושלם", body: "איכות מעולה והגיע מהר מהצפוי. ממליצה בחום!" },
    { title: "שווה כל שקל", body: "בדיוק כמו בתמונות. החנות גם הייתה זמינה לשאלות." },
    { title: "ممتاز", body: "جودة رائعة ووصل بسرعة. أنصح به بشدة." },
  ],
  4: [
    { title: "טוב מאוד", body: "מוצר טוב, האריזה הייתה קצת פשוטה אבל הכל הגיע תקין." },
    { title: "جيد جدًا", body: "منتج جيد مقابل السعر، التوصيل استغرق يومين إضافيين." },
  ],
  3: [{ title: "בסדר", body: "המוצר בסדר, ציפיתי לקצת יותר לפי התיאור." }],
  2: [{ title: "לא מה שציפיתי", body: "המידות קטנות מהמצופה, הייתי מזמין מידה אחת יותר גדולה." }],
  1: [{ title: "מאכזב", body: "הגיע עם שריטה. החנות הציעה החלפה אבל זה לקח זמן." }],
};

export async function seedHistory(db: PrismaClient, passwordHash: string) {
  const random = mulberry32(20261030);
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  const now = Date.now();

  // Start clean: ledger rows block deleting their sub-orders.
  const old = await db.order.findMany({ where: { number: { startsWith: "SEED-" } }, select: { id: true } });
  await db.ledgerEntry.deleteMany({ where: { subOrder: { orderId: { in: old.map((o) => o.id) } } } });
  await db.order.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });

  const customers = [];
  for (const c of CUSTOMERS) {
    customers.push(
      await db.user.upsert({
        where: { email: c.email },
        update: {},
        create: { email: c.email, name: c.name, role: "CUSTOMER" as Role, passwordHash, emailVerified: new Date() },
      }),
    );
  }

  const settings = await db.platformSettings.findUniqueOrThrow({ where: { id: 1 } });
  const categories = await db.category.findMany({ select: { id: true, parentId: true, commissionBps: true } });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const commissionFor = (categoryId: string, override: number | null) => {
    const chain = [];
    for (let c = byId.get(categoryId); c; c = c.parentId ? byId.get(c.parentId) : undefined) chain.push(c);
    return resolveCommissionBps(override, chain, settings.globalCommissionBps);
  };
  const shops = await db.shop.findMany({
    where: { slug: { in: ["techzone", "bayit-design", "urban-wear"] } },
    // Fixed order everywhere, so the same seed always produces the same history.
    orderBy: { slug: "asc" },
    include: {
      products: {
        where: { status: "ACTIVE", slug: { in: SEED_SLUGS } },
        orderBy: { slug: "asc" },
        include: { variants: { where: { isActive: true }, orderBy: { sku: "asc" } }, images: { take: 1, orderBy: { position: "asc" } } },
      },
    },
  });

  for (let n = 0; n < 36; n++) {
    const customer = pick(customers);
    const paidAt = new Date(now - Math.floor(random() * 60 * DAY) - 3_600_000);
    const orderShops = random() < 0.3 ? [shops[0], shops[1], shops[2]].sort(() => random() - 0.5).slice(0, 2) : [pick(shops)];
    const lines = orderShops.flatMap((shop) =>
      Array.from({ length: random() < 0.4 ? 2 : 1 }, () => {
        const product = pick(shop.products);
        return { shop, product, variant: pick(product.variants), quantity: random() < 0.2 ? 2 : 1 };
      }),
    );
    // One line per variant.
    const unique = [...new Map(lines.map((l) => [l.variant.id, l])).values()];
    const priced = unique.map((l) => ({ ...l, commissionBps: commissionFor(l.product.categoryId, l.shop.commissionBpsOverride) }));
    const split = splitOrder(
      priced.map((l) => ({ shopId: l.shop.id, unitPriceMinor: l.variant.priceMinor, quantity: l.quantity, commissionBps: l.commissionBps })),
      settings,
    );

    const shippedAt = new Date(paidAt.getTime() + DAY);
    const deliveredAt = new Date(paidAt.getTime() + 3 * DAY);
    const delivered = deliveredAt.getTime() < now;
    const shipped = shippedAt.getTime() < now;
    const status = delivered ? "DELIVERED" : shipped ? "SHIPPED" : "PAID";
    const released = delivered && deliveredAt.getTime() + settings.returnWindowDays * DAY < now;

    const order = await db.order.create({
      data: {
        number: `SEED-${String(n + 1).padStart(4, "0")}`,
        customerId: customer.id,
        status: deriveOrderStatus("PAID", split.shops.map(() => status), false),
        subtotalMinor: split.subtotalMinor,
        shippingMinor: split.shippingMinor,
        vatMinor: split.vatMinor,
        totalMinor: split.totalMinor,
        shippingAddress: { fullName: customer.name, phone: "0501234567", line1: "רחוב הדוגמה 1", city: "תל אביב", postalCode: "6100000", country: "IL" },
        paymentProvider: "test",
        paymentRef: `seed_${n + 1}`,
        paidAt,
        createdAt: paidAt,
        subOrders: {
          create: split.shops.map((s) => ({
            shopId: s.shopId,
            status,
            subtotalMinor: s.subtotalMinor,
            shippingMinor: s.shippingMinor,
            commissionMinor: s.commissionMinor,
            sellerNetMinor: s.sellerNetMinor,
            transferStatus: released ? "RELEASED" : "HELD",
            ...(shipped ? { shippedAt, carrier: "israel-post", trackingNumber: `RR${100000000 + n}IL` } : {}),
            ...(delivered ? { deliveredAt, releaseAt: new Date(deliveredAt.getTime() + settings.returnWindowDays * DAY) } : {}),
            createdAt: paidAt,
            events: {
              create: [
                { status: "PENDING", createdAt: new Date(paidAt.getTime() - 60_000) },
                { status: "PAID", createdAt: paidAt },
                ...(shipped ? [{ status: "PROCESSING" as const, createdAt: new Date(paidAt.getTime() + 4 * 3_600_000) }, { status: "SHIPPED" as const, createdAt: shippedAt }] : []),
                ...(delivered ? [{ status: "DELIVERED" as const, createdAt: deliveredAt }] : []),
              ],
            },
            items: {
              create: priced
                .filter((l) => l.shop.id === s.shopId)
                .map((l) => ({
                  variantId: l.variant.id,
                  productId: l.product.id,
                  titleSnapshot: l.product.title,
                  skuSnapshot: l.variant.sku,
                  imageSnapshot: l.product.images[0]?.url ?? null,
                  attributes: l.variant.attributes ?? {},
                  unitPriceMinor: l.variant.priceMinor,
                  quantity: l.quantity,
                  commissionBps: l.commissionBps,
                  lineTotalMinor: l.variant.priceMinor * l.quantity,
                })),
            },
          })),
        },
      },
      include: { subOrders: { include: { items: true } } },
    });

    await db.ledgerEntry.createMany({
      data: order.subOrders.flatMap((s) => [
        { shopId: s.shopId, subOrderId: s.id, type: "SALE" as const, amountMinor: s.subtotalMinor + s.shippingMinor, createdAt: paidAt },
        { shopId: s.shopId, subOrderId: s.id, type: "COMMISSION" as const, amountMinor: -s.commissionMinor, createdAt: paidAt },
      ]),
    });

    if (!delivered) continue;
    for (const item of order.subOrders.flatMap((s) => s.items)) {
      if (random() > 0.65) continue;
      const r = random();
      const rating = r < 0.45 ? 5 : r < 0.8 ? 4 : r < 0.92 ? 3 : r < 0.97 ? 2 : 1;
      const text = pick(REVIEWS[rating]);
      await db.review.create({
        data: {
          productId: item.productId,
          userId: customer.id,
          orderItemId: item.id,
          rating,
          title: text.title,
          body: text.body,
          sellerReply: rating <= 3 ? "תודה על המשוב! נשמח לעזור, צרו איתנו קשר דרך עמוד ההזמנה." : null,
          createdAt: new Date(deliveredAt.getTime() + DAY),
        },
      });
    }
  }

  // Ratings and sales counts follow from what was just created.
  await db.$executeRaw`
    UPDATE "Product" p SET
      "ratingAvg" = COALESCE((SELECT AVG(rating) FROM "Review" r WHERE r."productId" = p.id AND r.status = 'VISIBLE'), 0),
      "ratingCount" = (SELECT COUNT(*) FROM "Review" r WHERE r."productId" = p.id AND r.status = 'VISIBLE'),
      "salesCount" = COALESCE((SELECT SUM(i.quantity) FROM "OrderItem" i JOIN "SubOrder" s ON s.id = i."subOrderId" JOIN "Order" o ON o.id = s."orderId"
                               WHERE i."productId" = p.id AND o."paidAt" IS NOT NULL), 0)`;
  await db.$executeRaw`
    UPDATE "Shop" s SET
      "ratingAvg" = COALESCE((SELECT AVG(r.rating) FROM "Review" r JOIN "Product" p ON p.id = r."productId" WHERE p."shopId" = s.id AND r.status = 'VISIBLE'), 0),
      "ratingCount" = (SELECT COUNT(*) FROM "Review" r JOIN "Product" p ON p.id = r."productId" WHERE p."shopId" = s.id AND r.status = 'VISIBLE')`;
}
