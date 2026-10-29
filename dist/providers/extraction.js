"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockExtractionProvider = exports.MOCK_WARNING = void 0;
exports.getExtractionProvider = getExtractionProvider;
const env_1 = require("../config/env");
// ───────────── mock provider (development only) ─────────────
exports.MOCK_WARNING = "MOCK PROVIDER: no OCR or AI extraction was performed. These are empty placeholder drafts for manual entry; every field is flagged for human review.";
class MockExtractionProvider {
    name = "mock";
    isMock = true;
    async extract({ register, files, }) {
        return {
            providerName: this.name,
            isMock: true,
            warnings: [exports.MOCK_WARNING],
            // Deliberately empty: the mock never fabricates parish data.
            records: files.map((f) => ({
                fields: {},
                uncertainFields: register.fields.map((x) => x.path),
                confidence: 0,
                sourceFileId: f.id,
            })),
        };
    }
}
exports.MockExtractionProvider = MockExtractionProvider;
function getExtractionProvider() {
    switch (env_1.env.EXTRACTION_PROVIDER) {
        case "mock":
        default:
            return new MockExtractionProvider();
    }
}
//# sourceMappingURL=extraction.js.map