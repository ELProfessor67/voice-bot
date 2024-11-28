const mongoose = require("mongoose");
const { Schema } = mongoose;

const configSchema = new Schema(
    {
        aiModels: { type: Array },
        fillers: { type: Array },
        voiceId: { type: String, required: true },
        firstFiller: { type: String, required: true },
        audioSpeed: { type: Schema.Types.Decimal128, required: true },
        userId: { type: Schema.ObjectId, required: true, res: "users" },
        informationNeeded: { type: String },
    },
    { timestamps: true, versionKey: false }
);

const config = mongoose.model("config", configSchema);

module.exports = config;