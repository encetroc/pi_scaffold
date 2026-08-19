/**
 * Locate the `templates/` root shipped with this package. The templates tree
 * sits at the package root, next to `extensions/` (see package.json
 * `pi.extensions`). Resolved from THIS module's fixed location
 * (`<pkg>/extensions/lib/root.ts` → `../../templates`) so the depth never
 * depends on which extension module calls it. `SCAFSTAK_TEMPLATES` overrides
 * it (used by tests and custom installs).
 *
 * Shared by the `/scafstak` command and the authoring tools so both see the
 * same registry.
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function templateRoot(): string {
  const override = process.env.SCAFSTAK_TEMPLATES;
  if (override) return override;
  const moduleDir = fileURLToPath(import.meta.url);
  return `${dirname(moduleDir)}/../../templates`;
}
