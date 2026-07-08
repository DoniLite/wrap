import { describe, it, expect } from "bun:test";
import type { Context } from "hono";
import { AuthController, JwtCookieAuthController, Wrap, type AuthIdentity } from "@donilite/wrap";
import { UserRoles } from "@/helpers/access.helper";

const SECRET = "combine-test";

/**
 * A minimal second paradigm: a static header token, no cookies involved —
 * stands in for a "legacy" API-key-style client that can't do cookie
 * sessions. Exercises AuthController.combine()'s premise: mixing
 * unrelated paradigms in one app, including a hand-rolled controller
 * that isn't part of the framework itself (the "community package" case).
 */
class LegacyHeaderAuthController extends AuthController {
  public revokeCalls = 0;

  constructor(private readonly tokens: Map<string, AuthIdentity>) {
    super();
  }

  async authenticate(c: Context): Promise<AuthIdentity | null> {
    const token = c.req.header("X-Legacy-Token");
    if (!token) return null;
    return this.tokens.get(token) ?? null;
  }

  revoke(): void {
    this.revokeCalls += 1;
  }

  override openApiSecurityScheme(): Record<string, unknown> {
    return { legacyToken: { type: "apiKey", in: "header", name: "X-Legacy-Token" } };
  }
}

function buildCombinedApp(cookieAuth: JwtCookieAuthController, legacyAuth: LegacyHeaderAuthController) {
  const combined = AuthController.combine(cookieAuth, legacyAuth);
  const app = new Wrap();
  app.get("/private", combined.authMiddleware, (c) =>
    c.json({ identity: c.get("identity") }),
  );
  app.post("/logout", (c) => {
    combined.revoke(c);
    return c.json({ ok: true });
  });
  return { app, combined };
}

describe("AuthController.combine()", () => {
  it("authenticates via the first delegate that resolves an identity (cookie strategy)", async () => {
    const cookieAuth = new JwtCookieAuthController({ secret: SECRET });
    const legacyAuth = new LegacyHeaderAuthController(new Map());
    const { app } = buildCombinedApp(cookieAuth, legacyAuth);

    const token = await (async () => {
      let captured = "";
      const login = new Wrap();
      login.get("/login", async (c) => {
        captured = await cookieAuth.setupCookieSession(c, {
          userId: "browser-user",
          role: UserRoles.USER,
        });
        return c.json({ ok: true });
      });
      await login.request("/login");
      return captured;
    })();

    const res = await app.request("/private", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { identity: { userId: string } };
    expect(body.identity.userId).toBe("browser-user");
  });

  it("falls back to the next delegate when the first can't authenticate the request", async () => {
    const cookieAuth = new JwtCookieAuthController({ secret: SECRET });
    const legacyAuth = new LegacyHeaderAuthController(
      new Map([["legacy-token-1", { userId: "legacy-client", role: UserRoles.ADMIN }]]),
    );
    const { app } = buildCombinedApp(cookieAuth, legacyAuth);

    // No cookie, no bearer — only the legacy header. cookieAuth.authenticate()
    // must return null and control must pass to legacyAuth.
    const res = await app.request("/private", {
      headers: { "X-Legacy-Token": "legacy-token-1" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { identity: { userId: string } };
    expect(body.identity.userId).toBe("legacy-client");
  });

  it("rejects when no delegate can authenticate the request", async () => {
    const cookieAuth = new JwtCookieAuthController({ secret: SECRET });
    const legacyAuth = new LegacyHeaderAuthController(new Map());
    const { app } = buildCombinedApp(cookieAuth, legacyAuth);

    const res = await app.request("/private");
    expect(res.status).toBe(401);
  });

  it("revoke() runs on every delegate (best-effort)", async () => {
    const cookieAuth = new JwtCookieAuthController({ secret: SECRET });
    const legacyAuth = new LegacyHeaderAuthController(new Map());
    const { app } = buildCombinedApp(cookieAuth, legacyAuth);

    const res = await app.request("/logout", { method: "POST" });
    expect(res.status).toBe(200);
    expect(legacyAuth.revokeCalls).toBe(1);
    // cookieAuth.revoke() ran too — a cookie gets cleared even though none was set.
    expect(res.headers.get("set-cookie")).toContain("session=;");
  });

  it("merges every delegate's OpenAPI security scheme", () => {
    const cookieAuth = new JwtCookieAuthController({ secret: SECRET });
    const legacyAuth = new LegacyHeaderAuthController(new Map());
    const combined = AuthController.combine(cookieAuth, legacyAuth);

    const schemes = combined.openApiSecurityScheme();
    expect(Object.keys(schemes).sort()).toEqual(
      ["bearerAuth", "cookieAuth", "legacyToken"].sort(),
    );
  });

  it("throws when combined with no controllers", () => {
    expect(() => AuthController.combine()).toThrow();
  });
});
