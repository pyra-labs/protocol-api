import { describe, it, expect } from "vitest";
import config from "../config/config.js";
import QueryString from "qs";

const baseUrl = `http://localhost:${config.PORT}/data`;

describe("Test /data/price", () => {
    const routeUrl = `${baseUrl}/price`;

    it("Should return the price", async () => {
        const queryString = QueryString.stringify({
            ids: ["solana"],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toHaveProperty("solana");
        expect(typeof body.solana).toBe("number");
    });

    it("Should return multiple prices", async () => {
        const queryString = QueryString.stringify({
            ids: ["solana", "bitcoin"],
        }, {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);
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
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });

    it("Should return 400 if the ID is missing", async () => {
        const response = await fetch(`${routeUrl}`);

        expect(response.status).toBe(400);
    });
})

describe("Test /data/users", () => {
    const routeUrl = `${baseUrl}/users`;

    it("Should return the users", async () => {
        const response = await fetch(routeUrl);
        const body = await response.json();

        expect(response.status).toBe(200);

        expect(body).toHaveProperty("count");
        expect(typeof body.count).toBe("number");
        expect(body.count).toBeGreaterThan(0);

        expect(body).toHaveProperty("users");
        expect(Array.isArray(body.users)).toBe(true);
        expect(body.users.length).toBe(body.count);
        expect(body.users.every(
            (user: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(user)
        )).toBe(true);
    });
})