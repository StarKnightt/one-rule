# critic pass

**Limitation:** the brief asked for frames to be compared against real photos.
This build environment's network policy blocks Wikimedia
(`commons.wikimedia.org`, `upload.wikimedia.org`, `en.wikipedia.org`), so no
photographs could be downloaded. Instead, frames were pulled from the rendered
video (`scripts/critic-frames.sh`) and checked against **published
measurements** of each subject. `scripts/measure.ts` turns those checks into
numbers taken from the layouts themselves. A side-by-side check against real
photos is still to do.

References used:

- Bronchi: [Radiopaedia: main bronchus](https://radiopaedia.org/articles/main-bronchus) and [The Common Vein: right mainstem bronchus](https://thecommonvein.com/lungs/000-right-mainstem-bronchus/). The right main bronchus is ~25° off vertical, short (~1–2.5 cm) and wide. The left is ~45° and ~5 cm long. The right lung has 3 lobes and the left has 2, with a cardiac notch.
- Lightning tortuosity: [Univ. of Colombo high-speed photography studies](https://archive.cmb.ac.lk/items/e1c32e29-4a5c-4f01-955e-9a19748c9546). Natural ground flashes average ~26° of direction change, and long lab sparks have σ ≈ 15°.
- Deltas: [Edmonds & Slingerland 2007](https://ftp.ems.psu.edu/data/pub/geosc/sling/PUBLICATIONS_SLINGERLAND/2001-2010/Edmondsetal2007.pdf) found that channel width, depth and length fall nonlinearly with each bifurcation, and that asymmetric bifurcations are the stable, common case. An [AGU abstract](https://agu.confex.com/agu/os16/preliminaryview.cgi/Paper91395.html) on an experimental delta measured a mean bifurcation angle near 70° over 64 bifurcations.
- Fern fronds: [USFWS, *Diellia erecta*](https://www.fws.gov/species/asplenium-leaf-diellia-diellia-erecta) has 15–50 lance-shaped pinnae. [JSTOR Plants, *Asplenium pellucidum*](https://plants.jstor.org/compilation/Asplenium.pellucidum) has 20–36 pairs, opposite or alternate. [USPTO PP4257](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/PP4257) describes pinnae as "predominately alternate with occasional opposite arrangement".

## round 1: differences found

| form | measured / seen | reference | difference |
| --- | --- | --- | --- |
| fern | ~15 pinnae, strictly one per rachis node, blade broad and leaf-like, pinnules interlocking into a mesh | 15–50 pinnae, mostly alternate, narrow lanceolate blade, distinct pinnae | too few pinnae, outline reads as a leaf, no gaps between pinnae |
| lightning | main-channel turn 15.0°, plus a 5-point zig-zag on every segment (local kinks >45°) | ~26° natural, σ 15° lab | channel too straight at segment scale and too jittery at sub-segment scale. Too many short, hairy high-order branches |
| delta | sibling channels ~20–30° apart, all running near-parallel to an even coast, identical sine wiggles (a comb) | ~70° bifurcations, asymmetric, lengths shrink downstream | angle far too small, channels too uniform, meander identical on every reach |
| lungs | main bronchi both ~40°, hexagonal loop chains at the hilum and around the heart, thin strays crossing the cardiac notch | 25° right (short), 45° left (2× longer) | wrong main-bronchus geometry. Clamped steering made airways circle. Territories split across the heart made thin airways fly over it |
| morphs | bright blobs where dense twigs collapse. Invisible forest runners streak across the sky mid-morph | — | rendering artefacts |
| forest | pull-back only ~1.3×, trees a thin hedge on a tall black ground | — | weak reveal, low horizon contrast |

## fixes

- **fern:** rule depth went from 20 to 22. Pinnae now come in pairs: a pinna's first side shoot becomes its mirror twin across the rachis. The twin's first segment runs 24 px further up the rachis, so pairs are subalternate. Pinnae stand off the rachis at 81°→58°, pinnules were shortened to 0.17× the pinna, and the third-order lobes were removed.
- **lightning:** the random-walk turn range went from ±0.8 to ±1.3 rad, with mean reversion kept. Sub-segment jag was cut from 1.0 to 0.45. Branch probability per order went from .75/.5/.35/.2 to .7/.4/.2/.08, with longer branch segments.
- **delta:** the layout was rewritten as a steering walk. Children leave a split ±0.66 rad apart (≈76° before steering) with weak steering on the first reach, then bend toward the stretch of coast they feed. Splits are asymmetric (55–75 % of flow), meander scales with √flow, and some small channels end before the coast.
- **lungs:** main bronchi are fixed at 25°/62 px (right) and 45°/124 px (left). The turn clamp went from ±57° to ±126°, so upper-lobe airways can recur. A territory whose centroid falls outside the lung aims at its nearest real point. Small detached pieces of a territory are dropped, and any airway past the lobar level whose midpoint lies over the heart is pruned.
- **render:** a segment's width is capped at 0.6 × its length + 0.6, so collapsing segments make no blobs. Segments on their way out fade on the global morph clock, gone by a third of the way through, so twigs collapsing into a point don't pile up into bright blobs.
- **forest:** lower horizon, bigger trees, and the camera opens 2.6× into the crown of the biggest central tree, then pulls back over 7 s.

## round 2: re-measured (`npx tsx scripts/measure.ts`)

```
fern: 31 pinnae (15.5 pairs) — reference: Diellia erecta 15–50 pinnae; Asplenium pellucidum 20–36 pairs
lightning: main-channel mean |turn| 24.3° over 21 segments — reference: ~26° natural ground flashes, σ≈15° lab sparks
delta: 31 bifurcations, mean angle 72.3° — reference: ~70° (experimental delta, 64 bifurcations); 33 channel ends
lungs: right main bronchus 25° off vertical, left 45°; length ratio L/R 2.00 — reference: ~25° / ~45°, ~2.5 cm vs ~5 cm
lungs: 0 thin (<3px) branches longer than 60px (strays across the heart)
```

What remains, and why:

- **The delta is a tree.** Real deltas have channels that rejoin around islands, and a tree can't make loops.
- **The fern sits at the low end of the reference range** (~15 visible pairs). The rule caps the rachis at 22 nodes.
