export type FieldType = "string" | "date" | "number";

export interface FieldDef {
  /** Dotted path in the stored document and API payload, e.g. "firstHolyCommunion.date". */
  path: string;
  /** Column label exactly as it appears in the register (used for CSV/DOCX headers and docs). */
  label: string;
  type?: FieldType;
  maxLength?: number;
  /** Render in UPPERCASE in presentation/export output while preserving the stored value. */
  uppercaseInPresentation?: boolean;
}

export interface RegisterDef {
  /** Stable key used in revisions/audit/extraction (snake_case). */
  key: string;
  /** URL slug under /api/v1. */
  slug: string;
  title: string;
  modelName: string;
  collection: string;
  /** Fields in the exact register column order. */
  fields: FieldDef[];
  /** Path whose value drives the filterable `eventYear` (date string or number). */
  eventYearPath: string;
  /** Paths searched by the free-text `q` filter. */
  searchPaths: string[];
  /** Paths combined to detect possible duplicates (warning only). */
  duplicatePaths: string[];
  /** Paths that must be non-empty before a draft can be submitted for review. */
  requiredForReview: string[];
  /** Roles allowed to read this register. Customer care is deliberately never included. */
  readRoles: readonly ("admin" | "parish_priest")[];
  /** Roles allowed to create/edit/submit. */
  writeRoles: readonly ("admin" | "parish_priest")[];
  /** Roles allowed to verify / request correction. */
  verifyRoles: readonly ("admin" | "parish_priest")[];
  /** Set for registers that carry a priest signature block. */
  hasPriestSignature?: boolean;
  highlySensitive?: boolean;
}

export const defaultRoles = {
  readRoles: ["admin", "parish_priest"] as const,
  writeRoles: ["admin", "parish_priest"] as const,
  verifyRoles: ["admin", "parish_priest"] as const,
};
