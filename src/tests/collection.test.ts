import { describe, expect, it } from "vitest";
import {
  COLLECTION_RESULT_LABEL,
  latestNote,
  notesForCustomer,
  promisedOnDay,
  validateCollectionNote
} from "../core/receivables/local";

describe("customer collection notes", () => {
  it("requires contact date and a known result", () => {
    expect(validateCollectionNote({ customerId: "c1", result: "missed" }).ok).toBe(false);
    expect(validateCollectionNote({ customerId: "c1", contactedOn: "2026-08-31", result: "other" }).ok).toBe(false);
    const missed = validateCollectionNote({ customerId: "c1", contactedOn: "2026-08-31", result: "missed" });
    expect(missed.ok).toBe(true);
    if (missed.ok) expect(missed.note.result).toBe("missed");
  });

  it("requires a promised pay date when the result is 已答应", () => {
    expect(validateCollectionNote({ customerId: "c1", contactedOn: "2026-08-31", result: "promised" }).ok).toBe(false);
    const promised = validateCollectionNote({
      customerId: "c1",
      contactedOn: "2026-08-31",
      promisedOn: "2026-09-02",
      result: "promised"
    });
    expect(promised.ok).toBe(true);
    expect(COLLECTION_RESULT_LABEL.promised).toBe("已答应");
    expect(COLLECTION_RESULT_LABEL.missed).toBe("未接");
    expect(COLLECTION_RESULT_LABEL.paid).toBe("已付");
  });

  it("lists a customer's notes and today's promised pay dates", () => {
    const notes = [
      { id: "n1", customerId: "c1", contactedOn: "2026-08-30", result: "missed" as const },
      { id: "n2", customerId: "c1", contactedOn: "2026-08-31", promisedOn: "2026-08-31", result: "promised" as const },
      { id: "n3", customerId: "c2", contactedOn: "2026-08-31", promisedOn: "2026-08-31", result: "promised" as const }
    ];
    expect(notesForCustomer(notes, "c1").map((row) => row.id)).toEqual(["n2", "n1"]);
    expect(latestNote(notes, "c1")?.result).toBe("promised");
    expect(promisedOnDay(notes, "2026-08-31").map((row) => row.id)).toEqual(["n2", "n3"]);
    expect(promisedOnDay([], "2026-08-31")).toEqual([]);
  });
});
