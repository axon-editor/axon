import { describe, expect, it } from "vitest";
import {
  detectLanguageServerLanguage,
  detectMonacoLanguage,
} from "./languageDetection";

describe("structured language detection", () => {
  it.each(["xml", "xsd", "xsl", "xslt", "dtd", "svg"])(
    "maps .%s documents to XML",
    (extension) => {
      const filePath = `/workspace/schema.${extension}`;
      expect(detectMonacoLanguage(filePath)).toBe("xml");
      expect(detectLanguageServerLanguage(filePath)).toBe("xml");
    },
  );

  it("maps Protocol Buffers files to the proto language", () => {
    const filePath = "/workspace/api/service.proto";
    expect(detectMonacoLanguage(filePath)).toBe("proto");
    expect(detectLanguageServerLanguage(filePath)).toBe("proto");
  });
});
