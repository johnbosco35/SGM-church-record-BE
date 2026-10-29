"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDb = connectDb;
exports.disconnectDb = disconnectDb;
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("./env");
const http_1 = require("../middleware/http");
async function connectDb(uri = env_1.env.MONGODB_URI) {
    mongoose_1.default.set('strictQuery', true);
    await mongoose_1.default.connect(uri, { serverSelectionTimeoutMS: 10_000 });
    http_1.logger.info('MongoDB connected');
}
async function disconnectDb() {
    await mongoose_1.default.disconnect();
}
//# sourceMappingURL=db.js.map