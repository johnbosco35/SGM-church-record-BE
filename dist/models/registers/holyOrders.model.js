"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HolyOrders = exports.HolyOrdersDef = void 0;
const registerTypes_1 = require("../../config/registerTypes");
const buildRegisterModel_1 = require("./buildRegisterModel");
exports.HolyOrdersDef = {
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
    ...registerTypes_1.defaultRoles,
};
exports.HolyOrders = (0, buildRegisterModel_1.buildRegisterModel)(exports.HolyOrdersDef);
//# sourceMappingURL=holyOrders.model.js.map