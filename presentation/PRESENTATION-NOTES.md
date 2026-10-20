# FinBridge AI — dark project presentation

Final file: `../presentation-deck.pptx` (10 slides, 16:9).

The current deck is fully dark. It includes a dedicated real-world-struggles scenario, six editable PowerPoint charts, an editable funding waterfall, seven animated workflow illustrations, and a capture of the real local demo UI. All ten slides have native animation effects. PowerPoint rendered every slide without text overflow.

Slide order:
1. Product introduction — title and one sentence only
2. Problem statement — tuition funding waterfall and readiness doughnut
3. Real-world struggles — two-country student scenario and funding-runway line chart
4. Our solution — remittance-cost comparison and coordinated funding workflow
5. Our implementation — AI tool run, review flow and application architecture
6. Student features — budget/spending bars and actual demo overspending card
7. Parent features — approval-boundary bars and parent approval progression
8. Admin features — manual-settlement progression and queue chart
9. Security & privacy — permission-based student/parent views and security layers
10. Developer introduction — two circular demo portraits with editable names/roles

Open in PowerPoint Slide Show to see the staged workflow illustrations, native fade/wipe reveals, waterfall construction and chart entrances. Static previews are in `dark-preview/`; `dark-preview/contact-sheet.jpg` shows all slides. The deck remains editable. Charts and amounts have meaningful labels; data is explicitly illustrative or sourced from repository sandbox seeds, not current market rates or production measurements.

The example story uses CNY 40,000 tuition, CNY 27,500 initial funds, CNY 5,000 monthly income and CNY 2,125 monthly living costs for two months. The repository's funding formula yields CNY 33,250 projected funding, a CNY 6,750 gap and a CNY 3,375 additional monthly target. Provider quote totals are calculated using the actual remittance formula and seeded rates/fees. Exact inputs and outputs are in `dark-assets/chart-data.json`. The actual UI capture has its own demo amounts and is labeled separately.

Presenter notes preserve full feature detail and code references. Slide 10 uses demo people, as requested. Replace the two portraits, names and roles manually.

To rebuild:

```powershell
python presentation/build_dark_deck.py
powershell -NoProfile -ExecutionPolicy Bypass -File presentation/animate-dark-deck.ps1
python presentation/validate_dark_deck.py
```

The Python dependencies are in `.local/presentation-tools`. Animated GIF assets are cached in `dark-assets/`. The animation and preview step uses installed Microsoft PowerPoint. Earlier generations are preserved in `previous-deck.pptx` and `light-version.pptx`; their scripts are not the current generator.

Native animation implementation uses PowerPoint's [Sequence.AddEffect](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.sequence.addeffect) API. Workflow GIFs are staged illustrations of application behavior, not recordings of real AI or payment execution. The local demo server used for captures was stopped after capture.
