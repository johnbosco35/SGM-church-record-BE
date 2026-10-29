import { defaultRoles, type RegisterDef } from "../../config/registerTypes";
import { buildRegisterModel } from "./buildRegisterModel";

export const HolyOrdersDef: RegisterDef = {
  key: "holy_orders",
  slug: "holy-orders",
  title: "Holy Orders Register",
  modelName: "HolyOrders",
  collection: "holy_orders",
  fields: [
    { path: "number", label: "Number" },
    { path: "dateOfOrdination", label: "Date of Ordination", type: "date" },
    { path: "placeOfOrdination", label: "Place of Ordination" },
    { path: "name", label: "Name" },
    { path: "parents.father", label: "Parents — Father" },
    { path: "parents.mother", label: "Parents — Mother" },
    { path: "sponsor", label: "Sponsor" },
    { path: "minister", label: "Minister" },
  ],
  eventYearPath: "dateOfOrdination",
  searchPaths: [
    "number",
    "name",
    "parents.father",
    "parents.mother",
    "sponsor",
    "placeOfOrdination",
    "minister",
  ],
  duplicatePaths: ["name", "dateOfOrdination"],
  requiredForReview: ["number", "name", "dateOfOrdination"],
  ...defaultRoles,
};

export const HolyOrders = buildRegisterModel(HolyOrdersDef);
