---
name: Steam response identity
description: An undocumented identity quirk in Steam's public app-detail responses
---

For public Steam app-detail responses, do not assume the top-level JSON key is the requested game ID. Match the returned game's own app ID to the requested ID before using its price, genre, or safety metadata.

**Why:** The public endpoint returned valid details under a different package or DLC key for several popular games. Key-based lookup silently dropped otherwise eligible offers.

**How to apply:** Whenever a Steam adapter changes or new storefront data is added, validate the identity in the payload itself and fail closed if no matching game appears.