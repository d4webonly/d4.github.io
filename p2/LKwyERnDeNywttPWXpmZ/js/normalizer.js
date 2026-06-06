export function normalizeInput(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

export function isBlankInput(value) {
  return normalizeInput(value).length === 0;
}
