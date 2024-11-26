import { describe, it, expect } from "vitest";
import config from "../config/config";
import QueryString from "qs";
import { Keypair, PublicKey } from "@solana/web3.js";

const baseUrl = `http://localhost:${config.PORT}/drift`;
const testWallet = "DcJpAhpbhwgXF5UBJP1KN6ub4GS61TmAb32LtoB57pAf";
const invalidWallet = "AhnrRNffzaLsFB9aL29eQ3tW2te3srBZE6BTgkvzp9rq";


describe("Test /drift/rate", () => {
    const routeUrl = `${baseUrl}/rate`;

    it("Should return the rate", async () => {
        const queryString = QueryString.stringify({
            marketIndices: [0],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(1);

        expect(typeof body[0].depositRate).toBe("number");
        expect(typeof body[0].borrowRate).toBe("number");
    });

    it("Should return both rates", async () => {
        const queryString = QueryString.stringify({
            marketIndices: [0, 1],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(2);

        expect(typeof body[0].depositRate).toBe("number");
        expect(typeof body[0].borrowRate).toBe("number");

        expect(typeof body[1].depositRate).toBe("number");
        expect(typeof body[1].borrowRate).toBe("number");
    });

    it("Should return 400 if the market indices are missing", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });

    it("Should return 400 if the market indices are invalid", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
            marketIndices: ["notAnIndex"],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });
});


describe("Test /drift/balance", () => {
    const routeUrl = `${baseUrl}/balance`;

    it("Should return the balance", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
            marketIndices: [0],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);

        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(1);

        expect(typeof body[0]).toBe("number");
    });

    it("Should return both balances", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
            marketIndices: [0, 1],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);

        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(2);

        expect(typeof body[0]).toBe("number");
        expect(typeof body[1]).toBe("number");
    });

    it("Should return 400 if the address is not a Quartz user", async () => {
        const queryString = QueryString.stringify({
            address: invalidWallet,
            marketIndices: [0, 1],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });

    it("Should return 400 if the address is missing", async () => {
        const queryString = QueryString.stringify({
            marketIndices: [0, 1],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });

    it("Should return 400 if the market indices are missing", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });

    it("Should return 400 if the market indices are invalid", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
            marketIndices: ["notAnIndex"],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });
})


describe("Test /drift/withdraw-limit", () => {
    const routeUrl = `${baseUrl}/withdraw-limit`;

    it("Should return the withdraw limit", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
            marketIndices: [0],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);

        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(1);

        expect(typeof body[0]).toBe("number");
    });

    it("Should return both withdraw limits", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
            marketIndices: [0, 1],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);

        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(2);

        expect(typeof body[0]).toBe("number");
        expect(typeof body[1]).toBe("number");
    });

    it("Should return 400 if the address is not a Quartz user", async () => {
        const queryString = QueryString.stringify({
            address: invalidWallet,
            marketIndices: [0, 1],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });

    it("Should return 400 if the address is missing", async () => {
        const queryString = QueryString.stringify({
            marketIndices: [0, 1],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });

    it("Should return 400 if the market indices are missing", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });

    it("Should return 400 if the market indices are invalid", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
            marketIndices: ["notAnIndex"],
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });
})


describe("Test /drift/health", () => {
    const routeUrl = `${baseUrl}/health`;

    it("Should return the health", async () => {
        const queryString = QueryString.stringify({
            address: testWallet,
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(typeof body).toBe("number");
    });

    it("Should return 400 if the address is not a Quartz user", async () => {
        const queryString = QueryString.stringify({
            address: invalidWallet,
        },  {arrayFormat: "comma"});
        const response = await fetch(`${routeUrl}?${queryString}`);

        expect(response.status).toBe(400);
    });

    it("Should return 400 if the address is missing", async () => {
        const response = await fetch(`${routeUrl}`);
        expect(response.status).toBe(400);
    });
})
