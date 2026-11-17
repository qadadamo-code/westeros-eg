// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildXlsx, readTable } from "./xlsx";

describe("xlsx export", () => {
  it("writes a file the importer reads back", async () => {
    const bytes = buildXlsx(["كود الخام", "اسم الخام", "السعر"], [["00123", "جبنة <شيدر> & موزريلا", 829.56], ["10002", "", 0]]);
    const file = new File([bytes as BlobPart], "x.xlsx");
    const t = await readTable(file);
    expect(t.head).toEqual(["كود الخام", "اسم الخام", "السعر"]);
    expect(t.body[0]).toEqual(["00123", "جبنة <شيدر> & موزريلا", "829.56"]);
    expect(t.body[1][0]).toBe("10002");
    expect(t.body[1][2]).toBe("0");
  });
});
