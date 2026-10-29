import { defaultRoles, type RegisterDef } from "../../config/registerTypes";
import { buildRegisterModel } from "./buildRegisterModel";

/**
 * Highly sensitive. Never exposed to the public site, the JOHNBOSCO chatbot or customer care.
 * Column abbreviations are preserved exactly as printed in the register.
 */
export const SickCallDef: RegisterDef = {
  key: "sick_calls",
  slug: "sick-calls",
  title: "Sick-Call Register",
  modelName: "SickCall",
  collection: "sick_calls",
  fields: [
    { path: "number", label: "Number" },
    { path: "date", label: "Date", type: "date" },
    { path: "name", label: "Name" },
    { path: "address", label: "Address" },
    { path: "baptism", label: "Baptism" },
    { path: "confr", label: "Confr." },
    { path: "absolu", label: "Absolu." },
    { path: "blessing", label: "Blessing" },
    { path: "anoint", label: "Anoint." },
    { path: "viaticum", label: "Viaticum" },
    { path: "minister", label: "Minister" },
    { path: "remarks", label: "Remarks", maxLength: 2000 },
  ],
  eventYearPath: "date",
  searchPaths: ["number", "name", "address", "minister"],
  duplicatePaths: ["name", "date"],
  requiredForReview: ["number", "date", "name"],
  highlySensitive: true,
  ...defaultRoles,
};

export const SickCall = buildRegisterModel(SickCallDef);
