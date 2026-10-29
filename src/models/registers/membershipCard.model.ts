import { defaultRoles, type RegisterDef } from '../../config/registerTypes';
import { buildRegisterModel } from './buildRegisterModel';

export const MembershipCardDef: RegisterDef = {
  key: 'membership_cards',
  slug: 'membership-cards',
  title: 'Membership Card Register',
  modelName: 'MembershipCard',
  collection: 'membership_cards',
  fields: [
    { path: 'name', label: 'Name' },
    { path: 'address', label: 'Address' },
    { path: 'homeTown', label: 'Home Town' },
    { path: 'maritalStatus', label: 'Married or Single' },
    { path: 'baptized', label: 'Baptized' },
    { path: 'confirmed', label: 'Confirmed' },
    { path: 'society', label: 'Society' },
    { path: 'noOfChildren', label: 'No of Children', type: 'number' },
    { path: 'noOfChildrenBaptized', label: 'No of Children Baptized', type: 'number' },
    { path: 'year', label: 'Year', type: 'number' },
    { path: 'amount', label: 'Amount', type: 'number' },
    { path: 'receivedBy', label: 'Received By' }
    // "Parish Priest Signature" is NOT an ordinary field; see parishPriestSignature below.
  ],
  eventYearPath: 'year',
  searchPaths: ['name', 'homeTown', 'society', 'address'],
  duplicatePaths: ['name', 'homeTown', 'year'],
  requiredForReview: ['name', 'year'],
  hasPriestSignature: true,
  ...defaultRoles
};

export const MembershipCard = buildRegisterModel(MembershipCardDef);
