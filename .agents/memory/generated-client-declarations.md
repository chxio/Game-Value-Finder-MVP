---
name: Generated client declarations
description: Why frontend typechecks can disagree with the current generated API client source
---

When the frontend reports missing generated client exports or fields that clearly exist in the generated source, refresh the shared client's declaration build before changing frontend imports or API contracts.

**Why:** TypeScript project references can resolve previously emitted declarations instead of the current source. A stale declaration build can produce misleading missing-export and missing-field errors while the Vite bundle works correctly.

**How to apply:** Compare the generated source with emitted declarations first. Rebuild the shared client, then rerun the frontend typecheck; only edit contract code if errors remain.