const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decodeSnapshotPng(dataUrl: unknown) {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:image/png;base64,") ||
    dataUrl.length > MAX_SNAPSHOT_BYTES * 1.4
  ) {
    throw new Error("The snapshot payload is not a valid PNG image.");
  }

  const bytes = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_SNAPSHOT_BYTES ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error("The snapshot payload failed PNG validation.");
  }
  return bytes;
}
