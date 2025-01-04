"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const zod_1 = require("zod");
dotenv.config();
const envSchema = zod_1.z.object({
    RPC_URL: zod_1.z.string().url(),
    PORT: zod_1.z.coerce.number().min(0),
    EMAIL_TO: zod_1.z.string()
        .transform((str) => {
        try {
            const emails = str.split(',').map(email => email.trim());
            if (!emails.every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
                throw new Error();
            return emails;
        }
        catch {
            throw new Error("Invalid email list format: must be comma-separated email addresses");
        }
    }),
    EMAIL_FROM: zod_1.z.string().email(),
    EMAIL_HOST: zod_1.z.string(),
    EMAIL_PORT: zod_1.z.coerce.number().min(0),
    EMAIL_USER: zod_1.z.string().email(),
    EMAIL_PASSWORD: zod_1.z.string(),
    GOOGLE_CLIENT_EMAIL: zod_1.z.string().email(),
    GOOGLE_PROJECT_ID: zod_1.z.string(),
    GOOGLE_PRIVATE_KEY: zod_1.z.string(),
    GOOGLE_SPREADSHEET_ID: zod_1.z.string(),
    WEBFLOW_ACCESS_TOKEN: zod_1.z.string(),
    BREVO_API_KEY: zod_1.z.string(),
});
const config = envSchema.parse(process.env);
exports.default = config;
//# sourceMappingURL=config.js.map