# v0.8.3 playable video embed

In v0.8.3, deckjsx adds a lowercase `video` authoring tag as a Playable Video Embed, meaning the PPTX output should contain embedded playable media rather than degrading to a poster-only image or an external link. The first Video Compatibility Target is PowerPoint-compatible `video/mp4` with `.mp4`; unsupported or unknown video formats are Project errors, while missing poster input is a Project warning because poster display is separate from embedded media success.

deckjsx will not add broad HTML video playback props, built-in core URL fetching, transcoding, thumbnail extraction, or a renderer compatibility layer in this slice. Video bytes must come from inline media or the existing Asset Loading Boundary, video remains a distinct node and PPTX element kind rather than an image alias, and detailed video package vocabulary belongs to the Inspection Interface while the root Authoring Interface exposes only authoring vocabulary.

This accepts a narrower first video release in exchange for preserving the v0.8 Project/Render boundary, keeping renderer-specific playback differences explicit, and avoiding a public API that implies universal video format or playback-policy support.

PowerPoint repair-avoidance work discovered during the video slice may add minimal support parts such as `ppt/tableStyles.xml`, `p:defaultTextStyle`, and a fuller generated theme format scheme. These are compatibility scaffolding for valid PPTX packages, not a completed table-authoring design. If deckjsx adds a `table` tag in v0.8.4, `tableStyles.xml` should be revisited as a structured table-style output owned by the PPTX package model rather than treated as a fixed placeholder.
