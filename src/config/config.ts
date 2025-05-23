import { bs58 } from '@quartz-labs/sdk';
import { Keypair } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    RPC_URLS: z.string()
        .transform((str) => {
            try {
                const urls = str.split(',').map(url => url.trim());
                if (!urls.every(url => url.startsWith("https"))) throw new Error();
                return urls;
            } catch {
                throw new Error("Invalid RPC_URLS format: must be comma-separated URLs starting with https");
            }
        }),
    PORT: z.coerce.number().min(0),
    EMAIL_TO: z.string()
        .transform((str) => {
            try {
                const emails = str.split(',').map(email => email.trim());
                if (!emails.every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error();
                return emails;
            } catch {
                throw new Error("Invalid email list format: must be comma-separated email addresses");
            }
        }),
    EMAIL_FROM: z.string().email(),
    EMAIL_HOST: z.string(),
    EMAIL_PORT: z.coerce.number().min(0),
    EMAIL_USER: z.string().email(),
    EMAIL_PASSWORD: z.string(),
    GOOGLE_CLIENT_EMAIL: z.string().email(),
    GOOGLE_PROJECT_ID: z.string(),
    GOOGLE_PRIVATE_KEY: z.string(),
    GOOGLE_SPREADSHEET_ID: z.string(),
    WEBFLOW_ACCESS_TOKEN: z.string(),
    BREVO_API_KEY: z.string(), 
    FLASH_LOAN_CALLER: z.string().transform(
        (value) => {
            try {
                return Keypair.fromSecretKey(bs58.decode(value));
            } catch {
                throw new Error("FLASH_LOAN_CALLER must be a valid secret key");
            }
        }
    ),
    ROUTE_PREFIX: z.string().optional(),
});

const config = envSchema.parse(process.env);
export default config;