# GobbitBot

GobbitBot is the link-preview crawler of [Gobbit](https://github.com/Gobbit-App/service). Gobbit is a small app where families and communities keep shared cards of things worth remembering. When a member saves a link, Gobbit shows the page's title, a short description and a picture, the way chat apps do.

## How it identifies itself

```text
Mozilla/5.0 (compatible; GobbitBot/1.0; +https://github.com/Gobbit-App/service/blob/main/docs/crawler.md)
```

## What it fetches

- **Only links that members share or save.** A link reaches GobbitBot because a member shared it to the app, pasted it, emailed it in or saved it on a card. GobbitBot does not crawl the web, follow links it finds on a page or read sitemaps.
- **One page at a time, once.** It fetches the page itself and at most one preview picture for it. A one-time catch-up pass for older cards spaces its requests to at most one a minute per site.
- **Only the preview picture.** It downloads only the image the page names for previews (Open Graph, Twitter card, structured data and similar), or one large photo from the article. It never downloads scripts, stylesheets, fonts or other images.
- **Nothing private.** It never logs in, sends or keeps cookies, or runs scripts. It reads only what any visitor without an account sees.
- **Public lookup endpoints.** For YouTube, TikTok and Vimeo links it may ask the site's public oEmbed endpoint for the title and thumbnail, using the same identity.

Every request goes through a guarded client: it refuses private and internal addresses, limits redirects, response size and time, and accepts only web pages, images or (for oEmbed) JSON.

## Link checks

Gobbit also checks every now and then that saved links still open. Those requests read only the start of the page. They use a browser-like identity ending in `Gobbit/1.0`, because some sites refuse crawlers outright, and their links would otherwise be reported as broken.

## Contact

Please open an issue in the [repository](https://github.com/Gobbit-App/service/issues) to report a problem or ask Gobbit to stop fetching your site.
