import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

function makeReq(ip: string) {
  return new Request("http://localhost/test", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("rateLimit", () => {
  let key: string;
  beforeEach(() => {
    // Clé unique par test pour éviter les collisions de bucket entre suites
    key = `test:${Math.random().toString(36).slice(2)}`;
  });

  it("autorise jusqu'à max requêtes dans la fenêtre", () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < 3; i++) {
      const r = rateLimit(makeReq(ip), { key, max: 3, windowMs: 60_000 });
      expect(r.ok).toBe(true);
    }
  });

  it("bloque la requête au-delà de max", () => {
    const ip = "1.2.3.5";
    for (let i = 0; i < 3; i++) {
      rateLimit(makeReq(ip), { key, max: 3, windowMs: 60_000 });
    }
    const r = rateLimit(makeReq(ip), { key, max: 3, windowMs: 60_000 });
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("compte chaque IP séparément", () => {
    const a = rateLimit(makeReq("1.1.1.1"), { key, max: 1, windowMs: 60_000 });
    const b = rateLimit(makeReq("2.2.2.2"), { key, max: 1, windowMs: 60_000 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // Le 2e hit de 1.1.1.1 doit échouer alors que 2.2.2.2 est encore OK
    const a2 = rateLimit(makeReq("1.1.1.1"), { key, max: 1, windowMs: 60_000 });
    expect(a2.ok).toBe(false);
  });

  it("retombe sur 'unknown' si aucun header IP", () => {
    const req = new Request("http://localhost/test"); // pas d'x-forwarded-for
    const r = rateLimit(req, { key, max: 1, windowMs: 60_000 });
    expect(r.ok).toBe(true);
  });

  it("prend la première IP dans x-forwarded-for (chaîne de proxies)", () => {
    const req = new Request("http://localhost/test", {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1, 192.168.1.1" },
    });
    const r1 = rateLimit(req, { key, max: 1, windowMs: 60_000 });
    const r2 = rateLimit(req, { key, max: 1, windowMs: 60_000 });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
  });
});
