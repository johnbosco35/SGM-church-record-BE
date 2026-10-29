import { defaultRoles, type RegisterDef } from "../../config/registerTypes";
import { buildRegisterModel } from "./buildRegisterModel";

export const ConfirmationDef: RegisterDef = {
  key: "confirmations",
  slug: "confirmations",
  title: "Confirmation Register",
  modelName: "Confirmation",
  collection: "confirmations",
  fields: [
    { path: "number", label: "Number" },
    { path: "confirmationName", label: "Confirmation Name" },
    { path: "surname", label: "Surname" },
    { path: "otherName", label: "Other Name" },
    { path: "parents.father", label: "Parents — Father" },
    { path: "parents.mother", label: "Parents — Mother" },
    { path: "sponsor", label: "Sponsor" },
    { path: "baptism.lbn", label: "Baptism — LBN" },
    { path: "baptism.place", label: "Baptism — Place" },
    { path: "baptism.date", label: "Baptism — Date", type: "date" },
    { path: "mainPlace", label: "Main Place" },
    { path: "date", label: "Date", type: "date" },
    { path: "minister", label: "Minister" },
  ],
  eventYearPath: "date",
  searchPaths: [
    "number",
    "confirmationName",
    "surname",
    "otherName",
    "parents.father",
    "parents.mother",
    "sponsor",
    "mainPlace",
  ],
  duplicatePaths: ["confirmationName", "surname", "otherName", "baptism.date"],
  requiredForReview: ["number", "surname", "date"],
  ...defaultRoles,
};

export const Confirmation = buildRegisterModel(ConfirmationDef);
