import {
  emptyState,
  validateState,
  type State,
  type Paragraph,
} from "../domain/model";

export const collections = [
  "books",
  "chapters",
  "revisions",
  "flags",
  "proposals",
  "contexts",
  "chapterProposals",
  "materials",
  "files",
  "materialDeletions",
  "chapterCleanups",
] as const;
export type Collection = (typeof collections)[number];
type Row = Record<string, unknown> & { id: string };
export type Manifest = {
  schemaVersion: 1;
  collections: Record<Collection, { id: string; hash: string }[]>;
};
export type RecordPatch = {
  id: string;
  set: Record<string, unknown>;
  unset: string[];
};
export type Delta = {
  schemaVersion: 1;
  collections: Partial<
    Record<
      Collection,
      { upserts: RecordPatch[]; remove: string[]; order?: string[] }
    >
  >;
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const rows = (s: State, key: Collection) => s[key] as unknown as Row[];
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("Invalid differential sync object.");
  return v as Record<string, unknown>;
};
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
    v,
  );
export const fingerprint = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);

export function parseManifest(value: unknown): Manifest {
  const m = object(value),
    input = object(m.collections);
  if (m.schemaVersion !== 1 || Object.keys(input).length !== collections.length)
    throw Error("Unsupported differential sync manifest.");
  for (const key of collections) {
    const list = input[key];
    if (!Array.isArray(list) || list.length > 100000)
      throw Error("Invalid manifest collection.");
    const seen = new Set<string>();
    for (const item of list) {
      const row = object(item);
      if (!uuid(row.id) || !fingerprint(row.hash) || seen.has(row.id))
        throw Error("Invalid manifest identity or hash.");
      seen.add(row.id);
    }
  }
  return value as Manifest;
}

function paragraphDelta(
  value: unknown,
  base: State["revisions"][number] | undefined,
): unknown {
  if (!base) return value;
  const after = value as Paragraph[],
    before = new Map(base.paragraphs.map((p) => [p.id, p]));
  const out: Record<string, unknown> = {
    format: "paragraph-delta-v1",
    baseRevisionId: base.id,
    upserts: after.filter((p) => !same(p, before.get(p.id))),
  };
  if (
    !same(
      after.map((p) => p.id),
      base.paragraphs.map((p) => p.id),
    )
  )
    out.order = after.map((p) => p.id);
  return out;
}
function encodeFields(
  key: Collection,
  value: Row,
  fields: Record<string, unknown>,
  revisions: Map<string, State["revisions"][number]>,
) {
  if (key !== "revisions" && key !== "proposals") return fields;
  const base = revisions.get(
    (key === "revisions" ? value.parentId : value.baseRevisionId) as string,
  );
  if (Object.hasOwn(fields, "paragraphs"))
    fields.paragraphs = paragraphDelta(fields.paragraphs, base);
  if (fields.review && typeof fields.review === "object") {
    const review = fields.review as Record<string, unknown>;
    if (Array.isArray(review.paragraphs))
      fields.review = {
        ...review,
        paragraphs: paragraphDelta(review.paragraphs, base),
      };
  }
  return fields;
}
export function makeDelta(before: State, after: State): Delta {
  const delta: Delta = { schemaVersion: 1, collections: {} },
    revisions = new Map(after.revisions.map((r) => [r.id, r]));
  for (const key of collections) {
    const old = new Map(rows(before, key).map((r) => [r.id, r])),
      target = rows(after, key),
      ids = new Set(target.map((r) => r.id));
    const remove = [...old.keys()].filter((id) => !ids.has(id)),
      upserts: RecordPatch[] = [];
    for (const record of target) {
      const source = old.get(record.id),
        fields: Record<string, unknown> = {},
        unset: string[] = [];
      for (const [field, value] of Object.entries(record))
        if (field !== "id" && (!source || !same(value, source[field])))
          fields[field] = value;
      for (const field of Object.keys(source ?? {}))
        if (field !== "id" && !Object.hasOwn(record, field)) unset.push(field);
      if (Object.keys(fields).length || unset.length)
        upserts.push({
          id: record.id,
          set: encodeFields(key, record, fields, revisions),
          unset,
        });
    }
    const defaultOrder = [...old.keys()]
      .filter((id) => ids.has(id))
      .concat(target.filter((r) => !old.has(r.id)).map((r) => r.id));
    const order = target.map((r) => r.id),
      reordered = !same(defaultOrder, order);
    if (remove.length || upserts.length || reordered)
      delta.collections[key] = {
        upserts,
        remove,
        ...(reordered ? { order } : {}),
      };
  }
  return delta;
}
function expandParagraphs(
  value: unknown,
  base: State["revisions"][number],
): Paragraph[] {
  const wire = object(value);
  if (
    wire.format !== "paragraph-delta-v1" ||
    wire.baseRevisionId !== base.id ||
    !Array.isArray(wire.upserts)
  )
    throw Error("Invalid paragraph delta source.");
  const blocks = new Map(base.paragraphs.map((p) => [p.id, p])),
    updates = new Set<string>();
  for (const value of wire.upserts) {
    const row = object(value);
    if (!uuid(row.id) || updates.has(row.id))
      throw Error("Invalid paragraph delta identity.");
    updates.add(row.id);
    blocks.set(row.id, row as Paragraph);
  }
  const order = wire.order ?? base.paragraphs.map((p) => p.id);
  if (!Array.isArray(order) || new Set(order).size !== order.length)
    throw Error("Invalid paragraph order.");
  const selected = new Set<string>();
  const out = order.map((id) => {
    if (!uuid(id) || !blocks.has(id))
      throw Error("Missing paragraph in delta.");
    selected.add(id);
    return blocks.get(id)!;
  });
  if ([...updates].some((id) => !selected.has(id)))
    throw Error("Unordered paragraph update.");
  return out;
}
/** Assemble server-ordered collections, resolving source dependencies iteratively. */
export function assemble(
  manifest: Manifest,
  input: unknown,
  baseline = emptyState(),
): State {
  const records = object(input),
    state = emptyState();
  if (Object.keys(records).some((k) => !collections.includes(k as Collection)))
    throw Error("Unknown sync collection.");
  for (const key of collections) {
    const old = new Map(rows(baseline, key).map((r) => [r.id, r])),
      list = records[key] ?? [];
    if (!Array.isArray(list)) throw Error("Invalid sync records.");
    const downloaded = new Set<string>(),
      desired = new Set(manifest.collections[key].map((r) => r.id));
    for (const value of list) {
      const record = object(value);
      if (
        !uuid(record.id) ||
        downloaded.has(record.id) ||
        !desired.has(record.id)
      )
        throw Error("Invalid downloaded record identity.");
      downloaded.add(record.id);
      old.set(record.id, record as Row);
    }
    (state[key] as unknown as Row[]) = manifest.collections[key].map(
      ({ id }) => {
        const value = old.get(id);
        if (!value) throw Error("Incomplete differential download.");
        return { ...value };
      },
    );
  }
  const revisions = new Map(state.revisions.map((r) => [r.id, r])),
    waiting = new Map<string, unknown>(),
    children = new Map<string, string[]>(),
    ready: string[] = [];
  for (const r of state.revisions) {
    if (Array.isArray(r.paragraphs)) ready.push(r.id);
    else {
      const base = revisions.get(r.parentId ?? "");
      if (!base || base.chapterId !== r.chapterId)
        throw Error("Missing differential revision source.");
      waiting.set(r.id, r.paragraphs);
      children.set(base.id, [...(children.get(base.id) ?? []), r.id]);
    }
  }
  for (let i = 0; i < ready.length; i++)
    for (const id of children.get(ready[i]) ?? []) {
      revisions.get(id)!.paragraphs = expandParagraphs(
        waiting.get(id),
        revisions.get(ready[i])!,
      );
      waiting.delete(id);
      ready.push(id);
    }
  if (waiting.size) throw Error("Cyclic differential revision sources.");
  for (const p of state.proposals) {
    const base = revisions.get(p.baseRevisionId);
    if (!Array.isArray(p.paragraphs)) {
      if (!base || base.chapterId !== p.chapterId)
        throw Error("Missing differential proposal source.");
      p.paragraphs = expandParagraphs(p.paragraphs, base);
    }
    if (p.review && !Array.isArray(p.review.paragraphs)) {
      if (!base || base.chapterId !== p.chapterId)
        throw Error("Missing review source.");
      p.review = {
        ...p.review,
        paragraphs: expandParagraphs(p.review.paragraphs, base),
      };
    }
  }
  return validateState(state);
}
export function advanceManifest(
  manifest: Manifest,
  delta: Delta,
  state: State,
  value: unknown,
): Manifest {
  const hashes = object(value),
    result: Manifest = {
      schemaVersion: 1,
      collections: { ...manifest.collections },
    };
  for (const key of collections) {
    const lookup = new Map(
        manifest.collections[key].map((r) => [r.id, r.hash]),
      ),
      updates = object(hashes[key] ?? {});
    for (const patch of delta.collections[key]?.upserts ?? []) {
      if (!fingerprint(updates[patch.id]))
        throw Error("Missing committed record hash.");
      lookup.set(patch.id, updates[patch.id] as string);
    }
    result.collections[key] = rows(state, key).map((r) => {
      const hash = lookup.get(r.id);
      if (!hash) throw Error("Missing cached record hash.");
      return { id: r.id, hash };
    });
  }
  return result;
}
