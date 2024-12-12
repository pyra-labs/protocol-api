import config from "../config/config.js";
import { describe, expect, it } from "vitest";

const baseUrl = `http://localhost:${config.PORT}/`;

describe("Test root route", () => {
    it("Should return OK", async () => {
        const response = await fetch(baseUrl);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toHaveProperty("result");
        expect(body.result).toBe("ok");
    });
});