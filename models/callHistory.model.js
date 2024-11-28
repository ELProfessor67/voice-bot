const mongoose = require("mongoose");
const { Schema } = mongoose;

const callHistorySchema = new Schema(
    {
        streamSid: { type: String },
        accountSid: { type: String },
        callSid: { type: String },
        twilioNumber: { type: String },
        userId: { type: Schema.ObjectId, required: true, res: "users" },
        userContext: { type: Schema.Types.Mixed }
    },
    { timestamps: true, versionKey: false }
);

const callHistory = mongoose.model("callhistory", callHistorySchema);

module.exports = callHistory;