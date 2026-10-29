import mongoose, { Schema, type SchemaDefinition } from "mongoose";

const common: SchemaDefinition = {
  published: { type: Boolean, default: false, index: true },
  publishedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
};

function make(
  name: string,
  collection: string,
  def: SchemaDefinition,
  indexes: Array<Record<string, 1 | -1>> = [],
) {
  const schema = new Schema(
    { ...def, ...common },
    { timestamps: true, collection },
  );
  indexes.forEach((i) => schema.index(i));
  return mongoose.models[name] ?? mongoose.model(name, schema);
}

const str = (max: number, required = false) => ({
  type: String,
  trim: true,
  maxlength: max,
  required,
});

export const Announcement = make(
  "Announcement",
  "announcements",
  {
    title: str(200, true),
    body: str(5000, true),
    pinned: { type: Boolean, default: false },
    startsAt: Date,
    endsAt: Date,
  },
  [{ pinned: -1, publishedAt: -1 }],
);

export const ChurchEvent = make("ChurchEvent", "events", {
  title: str(200, true),
  description: str(5000),
  startsAt: { type: Date, required: true, index: true },
  endsAt: Date,
  location: str(200),
});

export const MassSchedule = make(
  "MassSchedule",
  "mass_schedules",
  {
    /** 0 = Sunday ... 6 = Saturday */
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    time: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    kind: {
      type: String,
      enum: ["sunday", "weekday", "holy_day", "special"],
      default: "sunday",
    },
    language: str(60),
    location: str(200),
    notes: str(500),
  },
  [{ dayOfWeek: 1, time: 1 }],
);

export const Ministry = make("Ministry", "ministries", {
  name: str(160, true),
  description: str(5000),
  leaderName: str(120),
  meetingSchedule: str(300),
  contactEmail: str(254),
});

export const Society = make("Society", "societies", {
  name: str(160, true),
  description: str(5000),
  leaderName: str(120),
  meetingSchedule: str(300),
  contactEmail: str(254),
});

export const SacramentInfo = make("SacramentInfo", "sacraments_information", {
  sacrament: {
    type: String,
    enum: [
      "baptism",
      "confirmation",
      "eucharist",
      "reconciliation",
      "anointing_of_the_sick",
      "holy_matrimony",
      "holy_orders",
    ],
    required: true,
    unique: true,
  },
  title: str(200, true),
  summary: str(1000),
  requirements: str(5000),
  body: str(10000),
});

export const News = make(
  "News",
  "news",
  {
    title: str(200, true),
    slug: {
      type: String,
      required: true,
      unique: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    summary: str(500),
    body: str(20000, true),
    coverImageUrl: str(500),
  },
  [{ publishedAt: -1 }],
);

export const GalleryItem = make("GalleryItem", "gallery", {
  title: str(200, true),
  caption: str(500),
  album: str(120),
  imageUrl: str(500, true),
});

export const Homily = make(
  "Homily",
  "homilies",
  {
    title: str(200, true),
    preacher: str(120),
    deliveredOn: Date,
    summary: str(1000),
    body: str(30000),
    audioUrl: str(500),
    videoUrl: str(500),
  },
  [{ deliveredOn: -1 }],
);

/**
 * Donation *records* only. No payment is processed by this backend: paymentStatus stays "not_processed"
 * and isDemo is always true until a real payment provider is integrated.
 */
const donationSchema = new Schema(
  {
    donorName: str(120),
    email: str(254),
    amount: { type: Number, required: true, min: 0.01, max: 100_000_000 },
    currency: { type: String, default: "NGN", match: /^[A-Z]{3}$/ },
    purpose: str(200),
    message: str(1000),
    anonymous: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: true },
    paymentStatus: {
      type: String,
      enum: ["not_processed"],
      default: "not_processed",
    },
    adminNote: str(1000),
  },
  { timestamps: true, collection: "donations" },
);
// Financial records are never deleted through this API; guard at model level too.
for (const h of ["deleteOne", "deleteMany", "findOneAndDelete"] as const) {
  donationSchema.pre(h, () => {
    throw new Error("Donation records cannot be deleted");
  });
}
export const Donation =
  mongoose.models.Donation ?? mongoose.model("Donation", donationSchema);

export const Message =
  mongoose.models.Message ??
  mongoose.model(
    "Message",
    new Schema(
      {
        name: str(120, true),
        email: str(254, true),
        phone: str(40),
        subject: str(200),
        body: str(4000, true),
        status: {
          type: String,
          enum: ["unread", "read", "archived"],
          default: "unread",
          index: true,
        },
        consentGiven: { type: Boolean, required: true },
      },
      { timestamps: true, collection: "messages" },
    ),
  );

export const WebsiteSettings =
  mongoose.models.WebsiteSettings ??
  mongoose.model(
    "WebsiteSettings",
    new Schema(
      {
        key: { type: String, default: "singleton", unique: true },
        churchName: str(200),
        tagline: str(300),
        about: str(5000),
        address: str(300),
        phone: str(40),
        email: str(254),
        officeHours: str(500),
        donationInstructions: str(2000),
        socialLinks: {
          facebook: str(300),
          instagram: str(300),
          youtube: str(300),
          x: str(300),
        },
        heroImageUrl: str(500),
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
      },
      { timestamps: true, collection: "website_settings" },
    ),
  );
