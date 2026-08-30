process.env.JWT_ACCESS_SECRET = "test-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

jest.mock("../config/db");
const pool = require("../config/db");
const request = require("supertest");
const app = require("../app");

describe("POST /v1/auth/register", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns 422 when required fields are missing", async () => {
    const res = await request(app)
      .post("/v1/auth/register")
      .send({ username: "test" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("validation_error");
  });

  it("returns 422 when passwords do not match", async () => {
    const res = await request(app).post("/v1/auth/register").send({
      full_name: "Test",
      username: "test",
      phone: "0812",
      email: "a@b.com",
      password: "password123",
      confirm_password: "different",
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /v1/auth/login", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns 401 when the identifier does not match any user", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post("/v1/auth/login")
      .send({ identifier: "nobody", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });

  it("returns 401 on wrong password without revealing whether the account exists", async () => {
    const bcrypt = require("bcrypt");
    const realHash = await bcrypt.hash("correct-password", 10);
    pool.query.mockResolvedValueOnce({
      rows: [{ id: "u1", password_hash: realHash, role: "attendee" }],
    });

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ identifier: "test", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials"); // same code as "user not found" — intentional
  });
});
