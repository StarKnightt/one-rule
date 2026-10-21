# The prompt

This project was built by Claude Code from the prompt below, which is copied verbatim.

```
build a 45-second 1080p60 video made entirely with code. concept: "one rule, repeated, grows into everything"

- canvas 2D + typescript, pnpm + vite. zero images, zero audio files
- a single white line on near-black. it splits using L-system rules and grows, then morphs through: a tree, a fern, lightning, a river delta seen from above, lungs (bronchial tree), and ends pulling back to a whole forest at dusk
- each form 5-7s, smooth morph between them (same branches re-shaping, not cuts)
- tiny lowercase label in a corner naming each form, fades in and out
- music synthesized with web audio from math: soft evolving pad + a gentle pluck on each branch split, mastered to about -14 LUFS
- render deterministically frame by frame with playwright + ffmpeg (chromium is preinstalled, don't run playwright install) to output/one-rule.mp4 with audio
- critic pass: extract frames at each form, compare against real photos of each subject (fern, lightning, river delta, lungs), list concrete shape differences, fix, re-render
- commit everything and push output/one-rule.mp4 to the repo
```

Follow-up requests in the same session:

- Re-encode the video at the highest quality that stays under GitHub's file size limit.
- Make the README presentable: a one-line description, a 10-second GIF preview, the rule and how it becomes each form, how the music is made, how to run and render, and the critic table with sources.
- Add images and diagrams to the README.

One deviation from the prompt: the build environment couldn't download photos, so the critic pass compared the shapes against published measurements instead (see [CRITIC.md](CRITIC.md)).
