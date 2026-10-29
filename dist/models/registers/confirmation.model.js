"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Confirmation = exports.ConfirmationDef = void 0;
const registerTypes_1 = require("../../config/registerTypes");
const buildRegisterModel_1 = require("./buildRegisterModel");
exports.ConfirmationDef = {
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
    ...registerTypes_1.defaultRoles,
};
exports.Confirmation = (0, buildRegisterModel_1.buildRegisterModel)(exports.ConfirmationDef);
//# sourceMappingURL=confirmation.model.js.map