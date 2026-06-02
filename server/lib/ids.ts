import { randomBytes } from "node:crypto";

export function newId(bytes = 12): string {
  return randomBytes(bytes).toString("hex");
}
