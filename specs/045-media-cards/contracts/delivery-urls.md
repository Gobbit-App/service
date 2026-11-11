# Delivery URL contract: Media cards (045)

The transformations below are declared once in `@gobbit/shared/media` (`MEDIA_DELIVERY`). The web
builder (`apps/web/src/cards/cloudinary.ts`), the API builder (`apps/api/src/lib/cloudinary-url.ts`) and
the signed `eager` list (D389, D392) all read from that declaration. A unit test fails if a builder
emits a video or audio transformation that isn't in the eager list.

Base: `https://res.cloudinary.com/<cloud>/<resource_type>/upload/<transformation>/<publicId>[.<ext>]`

| Use | Resource | Transformation | Ext | Eager |
|-----|----------|----------------|-----|-------|
| Image (unchanged; also each gallery photo) | image | `f_auto,q_auto,c_limit,w_{360,720,1080}` | – | no |
| Gallery photo in the viewer | image | `f_auto,q_auto,c_limit,w_{720,1080,2160}` | – | no |
| Placeholder (unchanged) | image | `f_auto,q_1,e_blur:2000,w_32` | – | no |
| PDF page N | image | `pg_N,f_auto,q_auto,c_limit,w_{360,720,1080,2160}` | – | no |
| PDF original | image | – | `.pdf` | no (needs PDF delivery enabled) |
| Video stream | video | `c_limit,w_1280,h_1280,q_auto,vc_auto` | `.mp4` | yes |
| Video still | video | `so_auto,f_auto,q_auto,c_limit,w_{360,720,1080}` | `.jpg` | yes |
| Audio stream | video | `q_auto` | `.mp3` | yes |
| Audio waveform | video | `fl_waveform,co_white,b_transparent,w_720,h_96` | `.png` | yes |
| Public page image (unchanged; each gallery photo) | image | `c_limit,w_1280,f_auto,q_auto` | – | no |
| Share preview: image (unchanged; a gallery's cover) | image | `c_fill,w_1200,h_630,f_jpg` | – | no |
| Share preview: video | video | `so_auto,c_fill,w_1200,h_630` | `.jpg` | no |
| Share preview: PDF | image | `pg_1,c_fill,g_north,w_1200,h_630,f_jpg` | – | no |

## Web components

| Component | Kind | Loads | Notes |
|-----------|------|-------|-------|
| `cards/ImageCard` | image, 1 photo | eager | `CloudImage`, unchanged rendering |
| `cards/media/GalleryCard` | image, 2–8 photos | eager (small) | cover `CloudImage` + "N photos" badge; tap → `PageViewer` (D398) |
| `cards/media/PdfCard` | pdf | lazy chunk | page-1 `CloudImage` + "PDF · N pages" + Read button → `PageViewer` |
| `cards/media/PageViewer` | image (gallery), pdf | lazy chunk (on open) | `<dialog>`, horizontal (photos) or vertical (pages) scroll-snap, "k of N", arrows, zoom, per-photo description; PDF adds Open original (D399) |
| `cards/media/VideoCard` | video | lazy chunk | `<video preload="none" poster>`, duration badge |
| `cards/media/AudioCard` | audio | lazy chunk | `<audio preload="none">`, waveform mask, duration |
| `cards/media/use-exclusive-playback` | audio/video | with the cards | one `play` listener on `document` pauses the other players |

`CloudImage` gains a `source` prop (`{ resourceType, publicId, prefix?, ext? }`) so stills and PDF pages
reuse its `srcSet` and measured `sizes` (D161). Stills and PDF pages skip the blurred placeholder
(it would be one more on-the-fly derivation per file). The box is reserved from the payload
dimensions and filled with the card's surface colour until the image loads.
