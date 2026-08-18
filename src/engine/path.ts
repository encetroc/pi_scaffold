/** Tiny path helpers shared by the engine modules. */

import { sep } from "node:path";

/** Normalize a filesystem path to posix separators for stable reporting. */
export function toPosix(path: string): string {
  return path.split(sep).join("/");
}
