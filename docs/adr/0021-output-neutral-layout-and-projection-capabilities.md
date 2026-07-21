# Output-neutral layout and projection-owned capabilities

Status: accepted

Projected Layout owns resolved geometry, generated cross-output visual layers, clipping, text construction, and authored paint intent. It does not decide whether PPTX, PDF, or a future output can reproduce a filter, blend mode, isolation group, opacity stacking context, stroke, outline, or background exactly.

Filter, blend, and isolation values are retained as typed Projected Paint Intent. Each output projection converts that intent into its own model and fallback diagnostics. Output-specific vocabulary is introduced only at that projection boundary. Projection diagnostics use the projected model as the canonical source for emitted elements; graph-derived fallback diagnostics are limited to semantic nodes that were omitted from the projected model.

Text measurement differences are selected through a named Text Measurement Profile. The presentation profile retains the conservative unregistered-font width allowance used by PPTX-oriented layout, while the PDF built-in Helvetica profile uses its direct width table without that allowance. Layout receives the profile explicitly and does not branch on output format.

Render-time asset load requirements belong to the Output Target boundary because they describe bytes required by a writer after projection. Projection Registry remains responsible for graph-to-model projection, model validation, diagnostics, and inspection; it does not import writer implementations. The Pipeline Runner delegates format-local projection reuse, post-hook normalization, and projection fingerprint behavior to a Projection Lifecycle module instead of switching on PPTX itself.

Asset Artifact probe and load diagnostics are tracked separately. Probe diagnostics survive with reusable probe metadata. Successful load warnings may survive with loaded bytes. Failed load diagnostics are transient and are replaced after a successful retry. PPTX package-part build bytes are retained in a format-local cache behind the Pipeline Artifact Collection facade.

## Consequences

- Projected Layout types and diagnostic text remain output-neutral.
- PPTX and PDF independently report capability loss from the same paint intent.
- PDF writing serializes the canonical PDF content and annotation model; projected visuals are inspection data, not a second writer input.
- Emitted-element fallback diagnostics come from the Projected Document Model, while omitted-node warnings retain graph provenance without duplicating model warnings.
- Output Target owns writer byte requirements, avoiding Projection-to-Writer dependency inversion.
- Format-local incremental and build-cache policy is concentrated outside the generic Pipeline Runner and artifact facade.
