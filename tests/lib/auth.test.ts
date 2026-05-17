import { describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import {
  AUTH_COOKIE_NAME,
  getAuthToken,
  jsonError,
  jsonServerError,
  signJwt,
  verifyJwt,
  requireRole,
} from "@/lib/auth";

const SECRET = "test-secret-not-for-prod-just-tests-32-chars!!";

function withSecret<T>(fn: () => T): T {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
}

function reqWithCookie(cookie: string) {
  return new Request("http://localhost/test", { headers: { cookie } });
}
function reqWithBearer(token: string) {
  return new Request("http://localhost/test", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("getAuthToken", () => {
  it("lit le cookie httpOnly en priorité", () => {
    const req = reqWithCookie(`${AUTH_COOKIE_NAME}=cookieTok; other=foo`);
    expect(getAuthToken(req)).toBe("cookieTok");
  });

  it("tombe sur Bearer si pas de cookie", () => {
    const req = reqWithBearer("bearerTok");
    expect(getAuthToken(req)).toBe("bearerTok");
  });

  it("ignore un header authorization sans schéma Bearer", () => {
    const req = new Request("http://localhost/test", {
      headers: { authorization: "Basic abc123" },
    });
    expect(getAuthToken(req)).toBeNull();
  });

  it("retourne null si rien", () => {
    expect(getAuthToken(new Request("http://localhost/test"))).toBeNull();
  });

  it("décode l'URL du cookie", () => {
    const encoded = encodeURIComponent("a.b.c+/=");
    const req = reqWithCookie(`${AUTH_COOKIE_NAME}=${encoded}`);
    expect(getAuthToken(req)).toBe("a.b.c+/=");
  });
});

describe("signJwt / verifyJwt", () => {
  it("signe un payload et le vérifie", () => {
    withSecret(() => {
      const token = signJwt({ sub: "u1", role: "EMPLOYEE" });
      const v = verifyJwt(reqWithBearer(token));
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.payload.sub).toBe("u1");
        expect(v.payload.role).toBe("EMPLOYEE");
      }
    });
  });

  it("rejette un token signé avec un autre secret", () => {
    withSecret(() => {
      const badToken = jwt.sign({ sub: "u2", role: "EMPLOYEE" }, "wrong-secret", { algorithm: "HS256" });
      const v = verifyJwt(reqWithBearer(badToken));
      expect(v.ok).toBe(false);
    });
  });

  it("rejette un token alg:none (algorithme non whitelisté)", () => {
    withSecret(() => {
      const unsigned = jwt.sign({ sub: "u3", role: "EMPLOYEE" }, "", {
        algorithm: "none",
      });
      const v = verifyJwt(reqWithBearer(unsigned));
      expect(v.ok).toBe(false);
    });
  });

  it("retourne 401 si pas de token", () => {
    withSecret(() => {
      const v = verifyJwt(new Request("http://localhost/test"));
      expect(v.ok).toBe(false);
    });
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("autorise un rôle whitelisté", () => {
    const token = signJwt({ sub: "u1", role: "CEO" });
    const v = requireRole(reqWithBearer(token), ["CEO", "ACCOUNTANT"]);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.auth.role).toBe("CEO");
  });

  it("refuse un rôle hors whitelist (403)", async () => {
    const token = signJwt({ sub: "u1", role: "EMPLOYEE" });
    const v = requireRole(reqWithBearer(token), ["CEO"]);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const json = await v.error.json();
      expect(v.error.status).toBe(403);
      expect(json.error).toMatch(/Accès refusé/);
    }
  });

  it("refuse si non authentifié (401)", () => {
    const v = requireRole(new Request("http://localhost/test"), ["CEO"]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.status).toBe(401);
  });
});

describe("jsonError / jsonServerError", () => {
  it("jsonError encode le message et le status", async () => {
    const res = jsonError("Bad input", 400, { field: "email" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Bad input");
    expect(json.field).toBe("email");
  });

  it("jsonServerError masque les détails en non-prod… (rappel : la valeur de IS_PROD est figée au chargement du module)", async () => {
    // Note : `isProduction()` est figé au chargement du module (IS_PROD = const).
    // On vérifie ici seulement le contrat de surface : status 500 + JSON valide.
    const res = jsonServerError(new Error("boom"));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toBe("Erreur serveur");
  });
});
