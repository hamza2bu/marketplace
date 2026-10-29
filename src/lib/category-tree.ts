export type CategoryNode = {
  id: string;
  slug: string;
  parentId: string | null;
  name: unknown;
  imageUrl: string | null;
  sortOrder: number;
};

/** The category and all of its descendants. */
export function descendantIds(categories: CategoryNode[], rootId: string): string[] {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++) {
    for (const c of categories) if (c.parentId === ids[i]) ids.push(c.id);
  }
  return ids;
}

/** Path from the top-level category down to `id`. */
export function ancestry<T extends CategoryNode>(categories: T[], id: string): T[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: T[] = [];
  for (let node = byId.get(id); node && path.length < 10; node = node.parentId ? byId.get(node.parentId) : undefined) {
    path.unshift(node);
  }
  return path;
}

export function childrenOf<T extends CategoryNode>(categories: T[], parentId: string | null): T[] {
  return categories.filter((c) => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
}
