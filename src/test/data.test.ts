import { describe, it, expect } from "vitest";
import config from "../config/config";
import QueryString from "qs";

describe("Test /data", () => {
    const baseUrl = `http://localhost:${config.PORT}/data`;

    it("Should return the price", async () => {
        const queryString = QueryString.stringify({
            ids: ["solana"],
        });
        const response = await fetch(`${baseUrl}/price?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toHaveProperty("solana");
        expect(typeof body.solana).toBe("number");
    });
})