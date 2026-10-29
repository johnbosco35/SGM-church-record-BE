"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTER_KEYS = exports.REGISTERS = void 0;
exports.getRegister = getRegister;
const baptism_model_1 = require("./baptism.model");
const confirmation_model_1 = require("./confirmation.model");
const firstHolyCommunion_model_1 = require("./firstHolyCommunion.model");
const holyMatrimony_model_1 = require("./holyMatrimony.model");
const holyOrders_model_1 = require("./holyOrders.model");
const membershipCard_model_1 = require("./membershipCard.model");
const sickCall_model_1 = require("./sickCall.model");
exports.REGISTERS = [
    { def: membershipCard_model_1.MembershipCardDef, model: membershipCard_model_1.MembershipCard },
    { def: baptism_model_1.BaptismDef, model: baptism_model_1.Baptism },
    { def: firstHolyCommunion_model_1.FirstHolyCommunionDef, model: firstHolyCommunion_model_1.FirstHolyCommunion },
    { def: confirmation_model_1.ConfirmationDef, model: confirmation_model_1.Confirmation },
    { def: holyMatrimony_model_1.HolyMatrimonyDef, model: holyMatrimony_model_1.HolyMatrimony },
    { def: holyOrders_model_1.HolyOrdersDef, model: holyOrders_model_1.HolyOrders },
    { def: sickCall_model_1.SickCallDef, model: sickCall_model_1.SickCall },
];
exports.REGISTER_KEYS = exports.REGISTERS.map((r) => r.def.key);
function getRegister(key) {
    const found = exports.REGISTERS.find((r) => r.def.key === key);
    if (!found)
        throw new Error(`Unknown register: ${key}`);
    return found;
}
//# sourceMappingURL=index.js.map