# Brand Voice Variants — Side-by-side comparison

> Pick A, B, C, or D — then I consolidate the chosen one into `docs/ux/DESIGN.md` (canonical) and proceed to per-journey mocks + components.md.

| Dimension | A — Conservative | B — Premium | C — Playful | D — Neutral baseline |
|---|---|---|---|---|
| **Vibe** | Notion/Linear, kitchen-functional | Luxe restauración alta | Distinctive open-source | shadcn defaults verbatim |
| **Brand identity?** | Slate-anonymous (intentional) | Strong: cream + emerald + serif | Strong: green-amber bridge | None (deferred to M2.1) |
| **Primary palette** | Slate + functional accents | Cream / charcoal / deep-emerald | Brand-green + brand-amber | shadcn slate |
| **Typography** | Inter + JetBrains Mono | Fraunces serif + Inter + sans nums | Geist + Geist Mono | Inter |
| **Motion** | <150ms functional only | 200-300ms hover lifts, soft fades | 200ms with character moments (save morph) | shadcn defaults |
| **Tablet vs Mobile priority** | Tablet primary; mobile adapt | Tablet + Mobile (Owner mobile is flagship) | Tablet + Mobile (brand on both) | Tablet primary; mobile shadcn |
| **Information density** | Highest (numerics monospace, tight) | Medium-high (more breath) | Medium (looser than A, tighter than B) | shadcn defaults |
| **Allergen badge** | Bordered rect, danger-red, icon+text | Pill, wine-burgundy, italic serif, icon | Pill, tomato-red outline, food emoji | shadcn destructive variant |
| **Voice** | Neutral, factual ("Cycle detected") | Sommelier-precise ("This recipe...") | Friendly+competent ("Heads up — Ragù...") | Standard shadcn templates |
| **Dev velocity** | Medium (custom tokens needed) | Slow (most customization) | Medium-fast (single sans family helps) | **Fastest** (zero customization) |
| **Pivot cost later** | Low (small token set) | Medium (serif + cream baked in) | High (brand baked deep) | **Lowest** (provisional by design) |
| **Best for first customer (Palafito)** | ✅ Chef-functional, gets out of the way | ⚠️ Risk feels "para guiris" in modest kitchen | ⚠️ Risk: developer-aesthetic for non-tech chefs | ✅ "Just works" — no opinion to defend |
| **Best for GitHub adoption** | ⚠️ Forgettable | ⚠️ Niche enterprise-feel | ✅ Distinctive identity wins stars | ⚠️ Generic |
| **Best for Nexandro Enterprise pitch** | ⚠️ Looks like dev tooling | ✅ Luxe positioning natural | ⚠️ Open-source vibe may not pitch | ⚠️ Generic |

## Sally's read after writing all four

- **D** is honest about what M2 actually is: an MVP for ONE customer. Best ROI for velocity. Pivot to A/B/C in M2.1 when signal arrives.
- **A** is the cleanest "we know what we are": kitchen-functional, no branding wank. If you'd rather lock identity early, go A.
- **B** is the strongest demo for a future enterprise sale, but it's a bet on positioning that hasn't been validated.
- **C** is the most fun to design, the most differentiated, but the highest pivot cost if signal comes back negative.

## My ranked recommendation

1. **D** for MVP (lowest risk, highest velocity, identity emerges from real signal)
2. **A** if you reject D's "deferred" stance and want a locked aesthetic now
3. **C** if you're in build-an-OSS-brand mode and want GitHub heat
4. **B** is for the day Nexandro Enterprise pitches start

But it's your call. The 4 docs are at:
- [docs/ux/variants/DESIGN-A-conservative.md](DESIGN-A-conservative.md)
- [docs/ux/variants/DESIGN-B-premium.md](DESIGN-B-premium.md)
- [docs/ux/variants/DESIGN-C-playful.md](DESIGN-C-playful.md)
- [docs/ux/variants/DESIGN-D-neutral.md](DESIGN-D-neutral.md)

Read whichever pull at you most; pick one (or hybrid — say "C palette + A density") and I consolidate into `docs/ux/DESIGN.md`.
