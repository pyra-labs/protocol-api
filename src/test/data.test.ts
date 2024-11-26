import { describe, it, expect } from "vitest";
import config from "../config/config";
import QueryString from "qs";

describe("Test /data", () => {
    const baseUrl = `http://localhost:${config.PORT}/data`;

    it("Should return the price", async () => {
        const queryString = QueryString.stringify({
            ids: ["solana"],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${baseUrl}/price?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toHaveProperty("solana");
        expect(typeof body.solana).toBe("number");
    });

    it("Should return multiple prices", async () => {
        const queryString = QueryString.stringify({
            ids: ["solana", "bitcoin"],
        }, {arrayFormat: "comma"});
        const response = await fetch(`${baseUrl}/price?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);

        expect(body).toHaveProperty("solana");
        expect(typeof body.solana).toBe("number");

        expect(body).toHaveProperty("bitcoin");
        expect(typeof body.bitcoin).toBe("number");
    });

    it("Should return 400 if the ID is invalid", async () => {
        const queryString = QueryString.stringify({
            ids: ["notAnIdSoShouldFail"],
        }, {arrayFormat: "comma"});
        const response = await fetch(`${baseUrl}/price?${queryString}`);

        expect(response.status).toBe(400);
    });

    it("Should return 400 if the ID is missing", async () => {
        const response = await fetch(`${baseUrl}/price`);

        expect(response.status).toBe(400);
    });
})