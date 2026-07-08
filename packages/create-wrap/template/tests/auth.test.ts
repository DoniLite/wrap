import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { JwtCookieAuthController, Wrap, type AppVariables } from "@donilite/wrap";
import { UserRoles } from "@/helpers/access.helper";

const SECRET = "test-secret";

function buildApp(auth: JwtCookieAuthController) {
  const app = new Wrap();
  app.get("/public", (c) => c.json({ ok: true }));
  app.get("/private", auth.authMiddleware, (c) =>
    c.json({ identity: c.get("identity") }),
  );
  app.get(
    "/private/admin",
    auth.authMiddleware,
    auth.requireRoles([UserRoles.ADMIN]),
    (c) => c.json({ ok: true }),
  );
  app.post("/logout", (c) => {
    auth.revoke(c);
    return c.json({ ok: true });
  });
  return app;
}

async function loginAs(
  auth: JwtCookieAuthController,
  userId: string,
  role: UserRoles,
): Promise<{ token: string; cookie: string }> {
  // Typed with AppVariables so `setupCookieSession`'s Context requirement
  // (it sets "identity") is satisfied — same Variables shape as every
  // controller's own Hono app.
  const login = new Hono<{ Variables: AppVariables }>();
  let token = "";
  login.get("/login", async (c) => {
    token = await auth.setupCookieSession(c, { userId, role });
    return c.json({ ok: true });
  });
  const res = await login.request("/login");
  const cookie = res.headers.get("set-cookie") ?? "";
  return { token, cookie: cookie.split(";")[0] ?? "" };
}

describe("JwtCookieAuthController", () => {
  it("rejects requests without a token", async () => {
    const auth = new JwtCookieAuthController({ secret: SECRET });
    const res = await buildApp(auth).request("/private");
    expect(res.status).toBe(401);
  });

  it("accepts a bearer token and exposes the identity", async () => {
    const auth = new JwtCookieAuthController({ secret: SECRET });
    const { token } = await loginAs(auth, "u1", UserRoles.ADMIN);

    const res = await buildApp(auth).request("/private", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      identity: { userId: string; role: string };
    };
    expect(body.identity.userId).toBe("u1");
    expect(body.identity.role).toBe(UserRoles.ADMIN);
  });

  it("accepts a session cookie and slides (refreshes) it", async () => {
    const auth = new JwtCookieAuthController({ secret: SECRET });
    const { cookie } = await loginAs(auth, "u2", UserRoles.USER);
    expect(cookie).toContain("session=");

    const res = await buildApp(auth).request("/private", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    // authMiddleware re-signs and refreshes the cookie on every request.
    expect(res.headers.get("set-cookie")).toContain("session=");
  });

  it("requireRoles blocks the wrong role and allows the right one", async () => {
    const auth = new JwtCookieAuthController({ secret: SECRET });
    const app = buildApp(auth);

    const { token: userToken } = await loginAs(auth, "u3", UserRoles.USER);
    const forbidden = await app.request("/private/admin", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(forbidden.status).toBe(403);

    const { token: adminToken } = await loginAs(auth, "u4", UserRoles.ADMIN);
    const allowed = await app.request("/private/admin", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(allowed.status).toBe(200);
  });

  it("revoke clears the session cookie", async () => {
    const auth = new JwtCookieAuthController({ secret: SECRET });
    const res = await buildApp(auth).request("/logout", { method: "POST" });

    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("session=;");
  });

  it("rejects a token signed with a different secret", async () => {
    const auth = new JwtCookieAuthController({ secret: SECRET });
    const otherAuth = new JwtCookieAuthController({ secret: "other-secret" });
    const { token } = await loginAs(otherAuth, "u5", UserRoles.ADMIN);

    const res = await buildApp(auth).request("/private", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("throws when constructed without a secret", () => {
    expect(() => new JwtCookieAuthController({ secret: "" })).toThrow();
  });

  it("exposes a static OpenAPI security scheme", () => {
    const schemes = JwtCookieAuthController.openApiSecurityScheme();
    expect(Object.keys(schemes)).toEqual(["bearerAuth", "cookieAuth"]);
  });
});
