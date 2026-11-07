import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { emptyState, validateState, type State } from "../../src/domain/model";
import { compactHistory } from "../../src/domain/compactHistory";
function fixture(revisions: number, paragraphs: number): State {
  const source = emptyState(),
    bookId = randomUUID(),
    chapterId = randomUUID();
  source.books.push({
    id: bookId,
    title: "Synthetic benchmark",
    premise: "",
    language: "bn",
    createdAt: new Date().toISOString(),
  });
  const blocks = Array.from({ length: paragraphs }, (_, i) => ({
    id: randomUUID(),
    label: i + 1,
    text:
      `বাংলা সংলাপ ${i}। ` + "A synthetic passage for measurement. ".repeat(2),
    section: "",
  }));
  let parentId: string | null = null;
  for (let i = 0; i < revisions; i++) {
    const id = randomUUID();
    source.revisions.push({
      id,
      chapterId,
      parentId,
      edition: 1,
      source: "author",
      createdAt: new Date().toISOString(),
      message: `Author session ${i}`,
      paragraphs: blocks.map((p, j) => ({
        ...p,
        text: j === 0 ? `${i} ${p.text}` : p.text,
      })),
    });
    parentId = id;
  }
  source.chapters.push({
    id: chapterId,
    bookId,
    title: "Chapter",
    code: 1,
    position: 0,
    headId: parentId!,
    approvedId: null,
    synopsis: "",
  });
  return source;
}
if (process.argv[2] === "--write") {
  writeFileSync(
    process.argv[3],
    JSON.stringify(
      fixture(Number(process.argv[4] || 800), Number(process.argv[5] || 400)),
    ),
  );
  process.exit(0);
}
let source: State | undefined =
  process.argv[2] === "--read"
    ? JSON.parse(readFileSync(process.argv[3], "utf8"))
    : fixture(Number(process.argv[2] || 800), Number(process.argv[3] || 400));
const bytes =
  process.argv[2] === "--read"
    ? statSync(process.argv[3]).size
    : Buffer.byteLength(JSON.stringify(source));
const gc = () => (globalThis as { gc?: () => void }).gc?.();
gc();
const start = performance.now();
const result = compactHistory(validateState(source));
source = undefined;
const elapsed = performance.now() - start;
await new Promise<void>((resolve) => setImmediate(resolve));
gc();
console.log(
  JSON.stringify({
    archiveMiB: bytes / 1048576,
    normalizeMs: elapsed,
    peakRssMiB:
      process.platform === "linux"
        ? Number(
            readFileSync("/proc/self/status", "utf8").match(
              /VmHWM:\s+(\d+)/,
            )![1],
          ) / 1024
        : process.resourceUsage().maxRSS / 1024,
    retainedHeapMiB: process.memoryUsage().heapUsed / 1048576,
    validated: result.revisions.length,
    uniqueBlocks: new Set(result.revisions.flatMap((r) => r.paragraphs)).size,
  }),
);
