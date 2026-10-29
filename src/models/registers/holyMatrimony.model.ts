import { defaultRoles, type RegisterDef } from "../../config/registerTypes";
import { buildRegisterModel } from "./buildRegisterModel";

export const HolyMatrimonyDef: RegisterDef = {
  key: "holy_matrimonies",
  slug: "holy-matrimonies",
  title: "Holy Matrimony Register",
  modelName: "HolyMatrimony",
  collection: "holy_matrimonies",
  fields: [
    { path: "number", label: "Number" },
    { path: "dateOfMarriage", label: "Date of Marriage", type: "date" },
    { path: "placeOfMarriage", label: "Place of Marriage" },
    {
      path: "bridegroom.name",
      label: "Bridegroom — Name",
      uppercaseInPresentation: true,
    },
    { path: "bridegroom.address", label: "Bridegroom — Address" },
    {
      path: "bride.name",
      label: "Bride — Name",
      uppercaseInPresentation: true,
    },
    { path: "bride.address", label: "Bride — Address" },
    { path: "age", label: "Age" },
    { path: "baptism.place", label: "Baptism — Place" },
    { path: "baptism.date", label: "Baptism — Date", type: "date" },
    { path: "baptism.noBp", label: "Baptism — No.B.P." },
    { path: "assistingPriest", label: "Assisting Priest" },
    { path: "dispensationsReceived", label: "Dispensations Received" },
    {
      path: "dispensationReferenceNumber",
      label: "Dispensation Reference Number",
    },
    {
      path: "bannsAndRelatedDetails",
      label: "Banns and Related Details",
      maxLength: 2000,
    },
    {
      path: "parents.bridegroomParents",
      label: "Parents — Bridegroom's Parents",
    },
    {
      path: "parents.bridegroomHomeTown",
      label: "Parents — Bridegroom's Home Town",
    },
    { path: "parents.brideParents", label: "Parents — Bride's Parents" },
    { path: "parents.brideHomeTown", label: "Parents — Bride's Home Town" },
    { path: "witness.man", label: "Witness — Man" },
    { path: "witness.woman", label: "Witness — Woman" },
  ],
  eventYearPath: "dateOfMarriage",
  searchPaths: [
    "number",
    "bridegroom.name",
    "bride.name",
    "placeOfMarriage",
    "assistingPriest",
    "witness.man",
    "witness.woman",
  ],
  duplicatePaths: ["bridegroom.name", "bride.name", "dateOfMarriage"],
  requiredForReview: [
    "number",
    "dateOfMarriage",
    "bridegroom.name",
    "bride.name",
  ],
  ...defaultRoles,
};

export const HolyMatrimony = buildRegisterModel(HolyMatrimonyDef);
