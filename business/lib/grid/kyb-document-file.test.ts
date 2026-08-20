import { describe, expect, it } from "vitest"
import { sniffKybDocumentContentType } from "./kyb-document-file"

describe("sniffKybDocumentContentType", () => {
  it("detects jpeg, png, pdf, and heic brands", () => {
    expect(sniffKybDocumentContentType(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "")).toBe("image/jpeg")
    expect(sniffKybDocumentContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), "")).toBe(
      "image/png",
    )
    expect(sniffKybDocumentContentType(Buffer.from("%PDF-1.4"), "")).toBe("application/pdf")
    const heic = Buffer.alloc(12)
    heic.write("xxxxftypheic", 0, "ascii")
    expect(sniffKybDocumentContentType(heic, "application/octet-stream")).toBe("image/heic")
    expect(sniffKybDocumentContentType(Buffer.from("nope"), "image/jpg")).toBe("image/jpeg")
  })
})
