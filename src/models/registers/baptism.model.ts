import { defaultRoles, type RegisterDef } from "../../config/registerTypes";
import { buildRegisterModel } from "./buildRegisterModel";

export const BaptismDef: RegisterDef = {
  key: "baptisms",
  slug: "baptisms",
  title: "Baptism Register",
  modelName: "Baptism",
  collection: "baptisms",
  fields: [
    { path: "number", label: "Number" },
    { path: "dateOfBaptism", label: "Date of Baptism", type: "date" },
    { path: "placeOfBaptism", label: "Place of Baptism" },
    { path: "baptismalName", label: "Baptismal Name" },
    { path: "otherName", label: "Other Name" },
    { path: "surname", label: "Surname" },
    { path: "dateOfBirth", label: "Date of Birth", type: "date" },
    { path: "placeOfBirth", label: "Place of Birth" },
    { path: "homeTown", label: "Home Town" },
    { path: "nameOfParents", label: "Name of Parents" },
    { path: "solemn", label: "Solemn" },
    { path: "nameOfGodparents", label: "Name of Godparents" },
    { path: "nameOfMinister", label: "Name of Minister" },
    {
      path: "firstHolyCommunion.date",
      label: "First Holy Communion — Date",
      type: "date",
    },
    { path: "firstHolyCommunion.place", label: "First Holy Communion — Place" },
    {
      path: "firstHolyCommunion.minister",
      label: "First Holy Communion — Minister",
    },
    { path: "confirmation.date", label: "Confirmation — Date", type: "date" },
    { path: "confirmation.place", label: "Confirmation — Place" },
    { path: "confirmation.minister", label: "Confirmation — Minister" },
    { path: "marriage.withWhom", label: "Marriage — With Whom" },
    { path: "marriage.date", label: "Marriage — Date", type: "date" },
    { path: "marriage.place", label: "Marriage — Place" },
    { path: "remarks", label: "Remarks", maxLength: 2000 },
  ],
  eventYearPath: "dateOfBaptism",
  searchPaths: [
    "number",
    "baptismalName",
    "otherName",
    "surname",
    "nameOfParents",
    "homeTown",
    "placeOfBaptism",
  ],
  duplicatePaths: ["baptismalName", "otherName", "surname", "dateOfBirth"],
  requiredForReview: ["number", "surname", "dateOfBaptism"],
  ...defaultRoles,
};

export const Baptism = buildRegisterModel(BaptismDef);
