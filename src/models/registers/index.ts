import type { Model } from "mongoose";
import type { RegisterDef } from "../../config/registerTypes";
import { BaptismDef, Baptism } from "./baptism.model";
import { ConfirmationDef, Confirmation } from "./confirmation.model";
import {
  FirstHolyCommunionDef,
  FirstHolyCommunion,
} from "./firstHolyCommunion.model";
import { HolyMatrimonyDef, HolyMatrimony } from "./holyMatrimony.model";
import { HolyOrdersDef, HolyOrders } from "./holyOrders.model";
import { MembershipCardDef, MembershipCard } from "./membershipCard.model";
import { SickCallDef, SickCall } from "./sickCall.model";

export type RegisterModel = Model<Record<string, unknown>>;

export const REGISTERS: Array<{ def: RegisterDef; model: RegisterModel }> = [
  { def: MembershipCardDef, model: MembershipCard },
  { def: BaptismDef, model: Baptism },
  { def: FirstHolyCommunionDef, model: FirstHolyCommunion },
  { def: ConfirmationDef, model: Confirmation },
  { def: HolyMatrimonyDef, model: HolyMatrimony },
  { def: HolyOrdersDef, model: HolyOrders },
  { def: SickCallDef, model: SickCall },
];

export const REGISTER_KEYS = REGISTERS.map((r) => r.def.key) as [
  string,
  ...string[],
];

export function getRegister(key: string): {
  def: RegisterDef;
  model: RegisterModel;
} {
  const found = REGISTERS.find((r) => r.def.key === key);
  if (!found) throw new Error(`Unknown register: ${key}`);
  return found;
}
