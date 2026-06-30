void (<img src="image.png" />);
void (<img src="./image.png" />);
void (<img src="https://example.test/image.png" />);
void (<video src="clip.mp4" poster="poster.png" />);
void (<img src="C:\\assets\\image.png" />);
void (<video src="C:\\assets\\clip.mp4" poster="C:\\assets\\poster.png" />);
// @ts-expect-error img src must be a non-empty media path or HTTP(S) URL; use data for inline media.
void (<img src="" />);
// Detailed media source path grammar is runtime validated.
void (<img src=" image.png" />);
// @ts-expect-error img src is for paths/URLs; use data for inline media.
void (<img src="data:image/png;base64,AAAA" />);

void (<img data="data:image/png;base64,AAAA" />);
void (<video data="data:video/mp4;base64,AAAA" poster="poster.png" />);
// @ts-expect-error img source props are mutually exclusive; use either src or data.
void (<img src="image.png" data="data:image/png;base64,AAAA" />);
// @ts-expect-error video source props are mutually exclusive; use either src or data.
void (<video src="clip.mp4" data="data:video/mp4;base64,AAAA" />);
// @ts-expect-error video poster source props are mutually exclusive; use either poster or posterData.
void (<video src="clip.mp4" poster="poster.png" posterData="data:image/png;base64,AAAA" />);
// @ts-expect-error img data must include data URI metadata and payload separator.
void (<img data="data:" />);
// @ts-expect-error img data must include non-empty data URI metadata and payload.
void (<img data="data:," />);
// Detailed data URI payload grammar is runtime validated.
void (<img data="data:image/png;base64," />);
// @ts-expect-error img data must include non-empty data URI metadata before the comma.
void (<img data="data:,AAAA" />);
// @ts-expect-error img data must be an inline data URI; use src for file paths.
void (<img data="image.png" />);
// @ts-expect-error video data must be an inline data URI; use src for file paths.
void (<video data="clip.mp4" />);
// @ts-expect-error video posterData must be an inline data URI; use poster for file paths.
void (<video src="clip.mp4" posterData="poster.png" />);
// @ts-expect-error deckjsx video does not expose browser playback props yet.
void (<video src="clip.mp4" controls />);
