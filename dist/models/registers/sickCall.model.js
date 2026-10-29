"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SickCall = exports.SickCallDef = void 0;
const registerTypes_1 = require("../../config/registerTypes");
const buildRegisterModel_1 = require("./buildRegisterModel");
/**
 * Highly sensitive. Never exposed to the public site, the JOHNBOSCO chatbot or customer care.
 * Column abbreviations are preserved exactly as printed in the register.
 */
exports.SickCallDef = {
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
    ...registerTypes_1.defaultRoles,
};
exports.SickCall = (0, buildRegisterModel_1.buildRegisterModel)(exports.SickCallDef);
//# sourceMappingURL=sickCall.model.js.map