# v0.9 Patchable PPTX and in-place package patch

v0.9 should make the normal `deck.render(pptx())` output a Patchable PPTX so the HMR-oriented compilation runtime can update deckjsx-generated presentation files through package-part identity instead of hiding a whole-deck rebuild behind watch mode. Core Render should produce runtime-neutral artifact bytes plus Render Patch Plan metadata, while `@deckjsx/node` owns `write(await deck.render(pptx()), "out.pptx")`, existing-file inspection, in-place package writes, file locking, and whole-archive rewrite fallback.

Patchable PPTX reserves capacity primarily in XML package parts by writing deckjsx-owned trailing XML comments, records persistent patchability metadata in `ppt/deckjsx/patch-manifest.json`, and avoids sidecar cache files. `@deckjsx/node` should recover ZIP offsets from the existing package central directory, use process memory only for hot-loop caching, patch in place when changed parts fit their reserved capacity, and rewrite the whole archive with diagnostics when the existing file is non-patchable or a changed part exceeds capacity.

`@deckjsx/node` may also provide the Node runtime's default local file AssetLoader. That loader belongs outside core: it can resolve absolute paths, importer-relative paths from Media Source Origin metadata, and explicit root-relative paths while returning result-first diagnostics for expected file read failures.

HMR invalidation should refresh stale process-memory compile/project artifacts before ordinary `deck.render(pptx())` continues, but retain PPTX package build artifacts so unchanged parts can still be reused by package-part fingerprint checks after the new projection is built.

The initial slide-unit reuse target is ordinary content edits where a slide keeps the same Graph Identity. Slide insertion and reordering still depend on a future stable slide-root identity hint in the authoring API; v0.9 should not pretend position-derived `deck.slide()` roots can provide complete insertion tolerance.

This chooses a stronger HMR contract than merely re-emitting a fresh PPTX quickly: unchanged package part bytes and slide identity should survive ordinary source edits. It rejects arbitrary-user-PPTX mutation and append-only duplicate ZIP entries because those paths are harder to make predictable across PowerPoint, LibreOffice, and ZIP readers; deckjsx can instead own the patchable artifact shape it generates and fall back safely when another tool rewrites or invalidates that shape.
