import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it.each(["text-px9-5", "text-px10-5", "text-px12-5", "text-px11"])(
    "keeps the %s size next to a text colour",
    (size) => {
      expect(cn(size, "text-muted-foreground")).toBe(`${size} text-muted-foreground`);
    }
  );

  it("still resolves two sizes to the last one", () => {
    expect(cn("text-px12-5", "text-px11")).toBe("text-px11");
  });
});
