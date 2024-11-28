const mongoose = require("mongoose");
const { Schema } = mongoose;

const promptSchema = new Schema(
    {
        name: { type: String, required: true },
        instructions: { type: String, required: true },
        assistantId: { type: String, required: true },
        userId: { type: Schema.ObjectId, required: true, ref: "users" },
        configId: { type: Schema.ObjectId, required: true, ref: "config" },
        twilioNumber: { type: String },
        isDefault: { type: Boolean, default: false }
    },
    { timestamps: true, versionKey: false }
);

const assistant = mongoose.model("assistant", promptSchema);

module.exports = assistant;