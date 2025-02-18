import { describe, it, expect } from "vitest";
import config from "../config/config.js";
import { MarketIndex } from "@quartz-labs/sdk";

const baseUrl = `http://localhost:${config.PORT}/data`;


describe("Test /data/price", () => {
    const routeUrl = `${baseUrl}/price`;

    it("Should return prices", async () => {
        const response = await fetch(routeUrl);
        const body = await response.json();

        expect(response.status).toBe(200);
        console.log(body);
        expect(body).toBeTypeOf("object");
        expect(Object.entries(body)).toSatisfy((values: [MarketIndex, number][]) => 
          values.every(([index, value]) => typeof value === "number" && Object.values(MarketIndex).includes(Number(index) as MarketIndex))
        );
        expect(Object.keys(body).length).toBe(Object.keys(MarketIndex).length);
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


describe("Test /data/tvl", () => {
    const routeUrl = `${baseUrl}/tvl`;

    it("Should return the TVL", async () => {
        const response = await fetch(routeUrl);
        const body = await response.json();

        expect(response.status).toBe(200);

        expect(body).toHaveProperty("collateral");
        expect(typeof body.collateral).toBe("string");
        expect(Number(body.collateral)).toBeGreaterThan(0);

        expect(body).toHaveProperty("loans");
        expect(typeof body.loans).toBe("string");
        expect(Number(body.loans)).toBeGreaterThan(0);

        expect(body).toHaveProperty("net");
        expect(typeof body.net).toBe("string");
        expect(Number(body.net)).toBeGreaterThan(0);
    });
})

describe("Test /data/waitlist", () => {
    const routeUrl = `${baseUrl}/waitlist`;

    it("Should successfully add to the waitlist with newsletter", async () => {
        const response = await fetch(routeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: "iarla@quartzpay.io",
                name: "Iarla Crewe",
                country: "Ireland",
                newsletter: true
            })
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toHaveProperty("message");
        expect(body.message).toBe("Email added to waitlist");
    });

    it("Should successfully add to the waitlist without newsletter", async () => {
        const response = await fetch(routeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: "diego@quartzpay.io",
                name: "Diego Garcia",
                country: "Ireland",
                newsletter: false
            })
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toHaveProperty("message");
        expect(body.message).toBe("Email added to waitlist");
    });

    it("Should do nothing if the email is already in the waitlist", async () => {
        const response = await fetch(routeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: "ken.crewe@gmail.com",
                name: "Ken Crewe",
                country: "Ireland",
                newsletter: true
            })
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toHaveProperty("message");
        expect(body.message).toBe("Email already exists in waitlist");
    })

    it("Should return 400 if the email is invalid", async () => {
        const response = await fetch(routeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: "notanemail",
                name: "Iarla Crewe",
                country: "Ireland",
                newsletter: true
            })
        });

        expect(response.status).toBe(400);
    })

    it("Should return 400 if the email is missing", async () => {
        const response = await fetch(routeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: "Iarla Crewe",
                country: "Ireland",
                newsletter: true
            })
        });

        expect(response.status).toBe(400);
    })

    it("Should return 400 if the name is missing", async () => {
        const response = await fetch(routeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: "iarla@quartzpay.io",
                country: "Ireland",
                newsletter: true
            })
        });

        expect(response.status).toBe(400);
    })

    it("Should return 400 if the country is missing", async () => {
        const response = await fetch(routeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: "iarla@quartzpay.io",
                name: "Iarla Crewe",
                newsletter: true
            })
        });

        expect(response.status).toBe(400);
    })

    it("Should return 400 if the newsletter is missing", async () => {
        const response = await fetch(routeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: "iarla@quartzpay.io",
                name: "Iarla Crewe",
                country: "Ireland",
            })
        });

        expect(response.status).toBe(400);
    })

    it("Should return 400 if the newsletter is invalid", async () => {
        const response = await fetch(routeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: "iarla@quartzpay.io",
                name: "Iarla Crewe",
                country: "Ireland",
                newsletter: "true"
            })
        });

        expect(response.status).toBe(400);
    })
})

describe("Test /data/update-website-data", () => {
    const routeUrl = `${baseUrl}/update-website-data`;

    it("Should update the website data", async () => {
        const response = await fetch(routeUrl, {
            method: "PUT"
        });
        const body = await response.json();

        expect(response.status).toBe(200);

        expect(body).toHaveProperty("yield");
        expect(typeof body.yield).toBe("number");
        expect(body.yield).toBeGreaterThan(0);
    })
})
