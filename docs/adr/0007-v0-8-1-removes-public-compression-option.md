# v0.8.1 removes the public compression option

In v0.8.1, deckjsx removes the public `compression` render option, the `PptxCompressionMode` public type, and compression/storage fields from public Render Assembly summaries. The direct PPTX writer is moving to a deckjsx-owned store-only ZIP path so v0.8.1 can remove the runtime ZIP/compression dependency and clarify writer responsibilities before HMR work. Future compression can be reintroduced through an internal compression adapter or optional package after real deck size and performance trade-offs are measured, but v0.8.1 should not preserve `fast`, `balanced`, `small`, or always-`store` reporting as no-op public behavior.

This accepts larger PPTX artifacts in the short term in exchange for deterministic store-only ZIP output, simpler writer failure boundaries, and a smaller runtime dependency graph.
