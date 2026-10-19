export function editorialReturnPath(value: unknown): string {
  if (typeof value !== "string") {
    return "/editorial";
  }
  if (!value.startsWith("/editorial") || value.startsWith("//") || value.includes("://")) {
    return "/editorial";
  }
  if (value.includes("\\") || value.includes("?")) {
    return "/editorial";
  }
  return value;
}
