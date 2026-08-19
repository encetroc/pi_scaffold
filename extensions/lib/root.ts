/**
 * Locate the `templates/` root shipped with this package. The templates tree
 * lives one directory up from `extensions/` (see package.json `pi.extensions`).
 * `SCAFSTAK_TEMPLATES` overrides it (used by tests and custom installs).
 *
 * Shared by the `/scafstak` command and the authoring tools so both see the
 * same registry.
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function templateRoot(thisModuleUrl: string): string {
  const override = process.env.SCAFSTAK_TEMPLATES;
  if (override) return override;
  const moduleDir = fileURLToPath(thisModuleUrl);
  return dirname(moduleDir) + "/../templates";
}
