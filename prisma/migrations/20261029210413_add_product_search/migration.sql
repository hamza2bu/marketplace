-- Full-text and fuzzy search for products.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 'simple' config: no stemming, which is the safe choice for Hebrew and Arabic.
ALTER TABLE "Product" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");

-- Trigram index for substring / typo-tolerant matches on titles.
CREATE INDEX "Product_title_trgm_idx" ON "Product" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Brand_name_trgm_idx" ON "Brand" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");
