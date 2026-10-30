export type WorkspaceTransport = {
  gzip: boolean;
  maxDecodedBytes: number;
  differential?: 1;
};
export class WorkspaceSizeError extends Error {}

/** Compress only after the authenticated server advertises support. */
export async function workspaceBody(
  serialized: string,
  transport?: WorkspaceTransport,
): Promise<{ body: string | Blob; gzip: boolean }> {
  const original = new Blob([serialized], { type: "application/json" });
  if (transport && original.size > transport.maxDecodedBytes)
    throw new WorkspaceSizeError(
      "This workspace exceeds the server's workspace limit. Export a device backup before reducing retained data. Your local changes are retained.",
    );
  if (
    !transport?.gzip ||
    original.size <= 20 * 1024 * 1024 ||
    typeof CompressionStream === "undefined"
  )
    return { body: serialized, gzip: false };
  const compressed = await new Response(
    original.stream().pipeThrough(new CompressionStream("gzip")),
  ).blob();
  return compressed.size < original.size
    ? { body: compressed, gzip: true }
    : { body: serialized, gzip: false };
}
