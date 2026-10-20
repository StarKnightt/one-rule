# one rule

A 45-second, 1080p60 film made only with code: one white line splits under a
single L-system rule and grows into a tree, a fern, lightning, a river delta,
a pair of lungs, and finally a forest at dusk. No images and no audio files.

```
X(n) : n > 0  →  F(n) [ X(n−1) ] [ X(n−2) ]
```

Rewriting `X(22)` gives a tree of 46,367 segments (a Fibonacci number minus
one). **Every form in the film is that same tree.** Each form is a layout, a
function that gives every segment an end point, a width and an alpha. A
segment a form doesn't need collapses to a point. Morphs blend each segment's
*relative* angle, length and width, then rebuild the tree root-first, so the
same branches re-shape on screen instead of cross-fading. The blend runs from
the root out to the tips.

| form | how the layout works |
| --- | --- |
| tree | alternating sympodial branching, lengths by remaining budget, pipe-model widths, mild phototropism |
| fern | stipe and rachis on the main axis. Pinnae come in opposite pairs (a pinna's first side shoot mirrors it across the rachis) inside a lanceolate envelope, with pinnules on the next order |
| lightning | a tortuous main channel built as a mean-reverting random walk, with branches that are pruned more often at higher orders, extra zig-zag subdivision, and bloom with return-stroke flashes |
| river delta | a meandering trunk to an apex, then channels that steer toward the stretch of lobate coast they feed. Splits are asymmetric and ~70° apart, widths follow √flow, and a few small channels silt up |
| lungs | a 2D version of Kitaoka's airway model: each branch aims at the centroid of the lung region it supplies, and that region is then cut in proportion to the two child subtrees. The main bronchi are fixed to anatomy (right ~25° and short, left ~45° and about twice as long). The cardiac notch is in the lung mask |
| forest | invisible runners spread across the ground plane in perspective (the forest is one organism, like an aspen clone), and every side shoot of a runner is a tree. The camera opens on one crown and pulls back |

The soundtrack is Web Audio in an `OfflineAudioContext`:

- Just-intonation pad chords (one per form) from detuned saws through an evolving low-pass.
- A Karplus–Strong pluck on every generation split while the tree grows, and on the wave of each morph.
- Brown-noise thunder after each lightning stroke and band-passed breath under the lungs.
- A reverb whose impulse response is synthesized.

The mix is mastered to −14 LUFS integrated with a −1.5 dBFS ceiling.

## run

```sh
pnpm install
pnpm dev                 # open /?play for a real-time preview with sound, /?frame=N for a still
pnpm render              # → output/one-rule.mp4
pnpm frames 690 1850     # render single frames to build/stills/
scripts/critic-frames.sh # pull comparison frames out of the finished video
```

`pnpm render` builds with Vite and serves the build. It drives headless
Chromium through Playwright, using the preinstalled browser, and never runs
`playwright install`. Every frame is drawn from its frame index alone, so the
render is deterministic. Frames go out as PNG into lossless RGB
segments, rendered in parallel. A two-pass x264 `veryslow` encode then
sizes the delivery file to `TARGET_MB` (default 96 MB, which keeps it under
GitHub's 100 MiB file cap) and muxes in the mastered audio as 320 kbps AAC.

See [CRITIC.md](CRITIC.md) for the comparison pass and what it changed.
