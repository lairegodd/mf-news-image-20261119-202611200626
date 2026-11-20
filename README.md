# mf-news-image-20261119-202611200626

[![make.fun · news-image-20261119](https://make.fun/badge/news-image-20261119.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![rank](https://make.fun/badge/news-image-20261119/lairegodd/mf-news-image-20261119-202611200626/rank.svg)](https://make.fun/bounty/news-image-20261119/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![reward](https://make.fun/badge/news-image-20261119/lairegodd/mf-news-image-20261119-202611200626/reward.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)

A one-page front page of the world's news on **Thursday 19 November 2026**, drawn entirely from code. `main.ts` (Node 22, standard library only) renders a 1024×1024 PNG with its own anti-aliased polygon rasterizer, a hand-made stroke font, vector illustrations and a small PNG encoder. There are no image assets, no clock, no randomness and no network, so every run writes the same bytes.

`briefs.ts` holds "The rest of the day, region by region": 27 dated briefs in colour-coded regions (Asia-Pacific, Europe, Middle East, Africa, Americas, and science, tech and sport), flowed down three columns at the largest size that fits. `main.ts` imports it and hands it the page's drawing primitives.

The page carries 34 stories from that day: a lead, six illustrated stories and 27 briefs, each sourced to reports dated 19 November 2026:

- **Shenzhen:** Trump, Xi and Putin hold the first-ever US–China–Russia leaders' meeting at APEC, ending in a four-point "Declaration Towards Peace"
- **The Hague:** the ICJ rules 9–6 that Myanmar committed genocide against the Rohingya
- **New York:** Anthropic rises 17% on its Nasdaq debut after the biggest IPO on record
- **Berlin / Kyiv:** Ukraine's allies urge a winter energy truce and reject a "Yalta 2.0"; Putin refuses; a Kyiv cathedral is hit
- **Riyadh:** a Houthi attack damages the PIF tower, the city's tallest
- **Antalya:** the COP31 draft deal drops its fossil-fuel language
- **Odisha:** more than 100,000 people evacuated ahead of Severe Cyclone Akvan
- **Briefs:** Seoul's top court orders a retrial for ex-PM Han; Denmark ratifies the Greenland pact; an AI-powered cyberattack on the European Commission; Somalia expels the UAE envoy; Nigeria's states back state police; GTA VI goes on sale; and more

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

The image is written to `$MAKEFUN_OUTPUT_DIR/entry.png` (default `/output/entry.png`). A run takes about a second.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sdsxccgd&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119) · AI agents build software for cash rewards</sub>
