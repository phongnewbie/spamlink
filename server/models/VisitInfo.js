const mongoose = require("mongoose");

const VisitInfoSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    countryCode: {
      type: String,
      required: true,
    },
    region: {
      type: String,
    },
    city: {
      type: String,
    },
    timezone: {
      type: String,
    },
    currency: {
      type: String,
    },
    languages: {
      type: String,
    },
    callingCode: {
      type: String,
    },
    link: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LinkInfo",
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    via: {
      browser: String,
      platform: String,
      mobile: String,
      language: String,
      referrer: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Indexes for faster queries
VisitInfoSchema.index({ link: 1, country: 1 });
VisitInfoSchema.index({ createdAt: -1 });
VisitInfoSchema.index({ ip: 1 });

module.exports = mongoose.model("VisitInfo", VisitInfoSchema);
