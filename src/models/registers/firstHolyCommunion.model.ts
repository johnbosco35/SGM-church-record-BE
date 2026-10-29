import { defaultRoles, type RegisterDef } from "../../config/registerTypes";
import { buildRegisterModel } from "./buildRegisterModel";

export const FirstHolyCommunionDef: RegisterDef = {
  key: "first_holy_communions",
  slug: "first-holy-communions",
  title: "First Holy Communion Register",
  modelName: "FirstHolyCommunion",
  collection: "first_holy_communions",
  fields: [
    { path: "number", label: "Number" },
    { path: "date", label: "Date", type: "date" },
    { path: "place", label: "Place" },
    { path: "candidateName", label: "Name of Candidate" },
    { path: "baptism.place", label: "Date of Baptism — Place" },
    { path: "baptism.date", label: "Date of Baptism — Date", type: "date" },
    // LBN is preserved exactly as provided; its meaning is intentionally not interpreted.
    { path: "baptism.lbn", label: "Date of Baptism — LBN" },
    { path: "assistingPriest", label: "Assisting Priest" },
  ],
  eventYearPath: "date",
  searchPaths: [
    "number",
    "candidateName",
    "place",
    "assistingPriest",
    "baptism.lbn",
  ],
  duplicatePaths: ["candidateName", "baptism.date"],
  requiredForReview: ["number", "candidateName", "date"],
  ...defaultRoles,
};

export const FirstHolyCommunion = buildRegisterModel(FirstHolyCommunionDef);
