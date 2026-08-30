jest.mock("../config/db");
const pool = require("../config/db");
const { processCheckin } = require("./checkin.service");

describe("processCheckin", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns no_active_event when there are no events today", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const result = await processCheckin("user-1");
    expect(result.status).toBe("no_active_event");
  });

  it("returns too_early when the window has not opened yet", async () => {
    const future = new Date(Date.now() + 5 * 60 * 60 * 1000); // 5h from now
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "evt-1",
          name: "Test Event",
          location: "X",
          event_datetime: future,
          checkin_open_minutes: 120,
          checkin_close_minutes: 60,
        },
      ],
    });
    const result = await processCheckin("user-1");
    expect(result.status).toBe("too_early");
  });

  it("returns success and inserts attendance when inside the window and not yet checked in", async () => {
    const now = new Date();
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evt-1",
            name: "Test Event",
            location: "X",
            event_datetime: now,
            checkin_open_minutes: 120,
            checkin_close_minutes: 60,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // no existing attendance
      .mockResolvedValueOnce({ rows: [{ checked_in_at: now }] }); // insert result

    const result = await processCheckin("user-1");
    expect(result.status).toBe("success");
  });

  it("returns already_checked_in when attendance already exists", async () => {
    const now = new Date();
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evt-1",
            name: "Test Event",
            location: "X",
            event_datetime: now,
            checkin_open_minutes: 120,
            checkin_close_minutes: 60,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ checked_in_at: now }] }); // existing attendance found

    const result = await processCheckin("user-1");
    expect(result.status).toBe("already_checked_in");
  });
});
