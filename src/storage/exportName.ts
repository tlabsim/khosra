/** Windows-safe names retain Bengali/Unicode titles and use the device's local time. */
export function exportName(
  title: string | undefined,
  kind: "workspace" | "manuscript",
  date = new Date(),
) {
  const clean = Array.from(
    (title || "")
      .normalize("NFC")
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, "-")
      .trim()
      .replace(/\s+/gu, "-")
      .replace(/[. -]+$/u, ""),
  )
    .slice(0, 100)
    .join("");
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return (
    [
      "khosra",
      kind === "workspace" ? "workspace" : "",
      clean || (kind === "manuscript" ? "manuscript" : ""),
      stamp,
    ]
      .filter(Boolean)
      .join("-") + (kind === "workspace" ? ".json" : ".md")
  );
}
