import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    DRIFT_KEYPAIR: z.string()
        .transform((str) => {
            try {
                const numbers = JSON.parse(str);
                if (!Array.isArray(numbers) || !numbers.every((n) => typeof n === 'number')) {
                    throw new Error();
                }
                return new Uint8Array(numbers);
            } catch (error) {
                throw new Error("Invalid keypair format: must be a JSON array of numbers");
            }
        })
        .refine((bytes) => bytes.length === 64, {message: "Keypair must be 64 bytes long"}),
    RPC_URL: z.string().url(),
    PORT: z.coerce.number().min(0),
});

const config = envSchema.parse(process.env);
export default config;

