"""
FinBridge AI — Presentation v4 builder
Reads from presentation-deck-v3.pptx and outputs presentation-deck-v4.pptx.

V4 design philosophy:
  - Cinematic dark theme with layered depth (background → mid → content → accent)
  - Consistent design system: every slide uses the same spacing, type scale, card radius
  - Morph transitions between slides (PowerPoint 2019+/365)
  - Upgraded charts: gradient-colored bars, larger data labels, cleaner axes
  - New illustrations for Solution, AI, and Real-world-struggles slides
  - Decorative consistent background elements (subtle dot grid, accent strips)
    named identically across slides so Morph animates them smoothly
  - All content preserved from v3 user edits
"""

from pathlib import Path
import sys, re, copy

sys.path.insert(0, str(Path('.local/presentation-tools').resolve()))

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION
from pptx.chart.data import CategoryChartData
from pptx.oxml.xmlchemy import OxmlElement
from lxml import etree

# ── Paths ─────────────────────────────────────────────────────────────────────
SOURCE = Path('presentation-deck-v3.pptx')
OUT_DIR = Path('presentation/v4')
AS = OUT_DIR / 'assets'

COVER_IMG    = Path('presentation/v3/assets/cover-hero.png')       # v3 cover (good)
THANKYOU_IMG = Path('presentation/v3/assets/thankyou-hero.png')    # v3 thank you (good)
PROBLEM_IMG  = Path('presentation/v2/assets/student-funding-problem.png')  # v2 problem
SOLUTION_IMG = AS / 'solution-hero.png'
AI_IMG       = AS / 'ai-hero.png'
STRUGGLES_IMG = AS / 'struggles-hero.png'

# ── Palette ───────────────────────────────────────────────────────────────────
BG      = '060D18'   # darkest background
PANEL   = '0D1B2E'   # card/panel surface
SURFACE = '112236'   # lighter surface
MID     = '162D45'   # midtone
BORDER  = '1E3A58'   # subtle border
GRID    = '243F60'   # slightly visible lines
WHITE   = 'F0F6FF'   # near-white text
OFF     = 'C8D8EE'   # slightly off-white
MUTED   = '8BA4BE'   # muted/secondary text
DIM     = '4A6882'   # very dim
TEAL    = '5BDDBA'   # primary mint accent (slightly warmer)
TEAL2   = '3BC9A3'   # deeper teal
BLUE    = '4FB3F7'   # primary blue
BLUE2   = '2B96E2'   # deeper blue
GOLD    = 'F5CA6A'   # warm amber
GOLD2   = 'E8AC36'   # deeper gold
RED     = 'FF7A8A'   # coral/red
PURPLE  = 'A896F5'   # soft purple
DARK    = '030912'   # darkest dark for scrims

def rgb(c): return RGBColor.from_string(c)

# ── Namespaces ─────────────────────────────────────────────────────────────────
NS_P    = 'http://schemas.openxmlformats.org/presentationml/2006/main'
NS_A    = 'http://schemas.openxmlformats.org/drawingml/2006/main'
NS_P14  = 'http://schemas.microsoft.com/office/powerpoint/2010/main'
NS_P15  = 'http://schemas.microsoft.com/office/powerpoint/2012/main'

# ── Shape helpers ──────────────────────────────────────────────────────────────
def delete(sh): sh._element.getparent().remove(sh._element)

def clear(s):
    for sh in list(s.shapes): delete(sh)
    for el in list(s._element):
        if el.tag.endswith('}timing') or el.tag.endswith('}transition'):
            s._element.remove(el)

def set_bg(s, c=BG):
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = rgb(c)

def rect(s, x, y, w, h, c=PANEL, r=0.0, border=None, name=None, order=None):
    if r > 0:
        sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
        sh.adjustments[0] = r
    else:
        sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.fill.solid(); sh.fill.fore_color.rgb = rgb(c)
    sh.line.fill.background()
    if border:
        sh.line.color.rgb = rgb(border); sh.line.width = Pt(1.0)
    if name: sh.name = name
    if order is not None: sh.name = f'reveal_{order:02d}'
    return sh

def oval(s, x, y, d, c, name=None):
    sh = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(d), Inches(d))
    sh.fill.solid(); sh.fill.fore_color.rgb = rgb(c); sh.line.fill.background()
    if name: sh.name = name
    return sh

def tx(s, t, x, y, w, h, sz=18, c=WHITE, b=False, order=None, align=None, italic=False, spacing=4, name=None):
    sh = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = sh.text_frame; tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, row in enumerate(t.split('\n')):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = row
        p.font.name = 'Aptos Display' if b and sz >= 28 else 'Aptos'
        p.font.size = Pt(sz); p.font.bold = b; p.font.italic = italic
        p.font.color.rgb = rgb(c); p.space_after = Pt(spacing)
        if align: p.alignment = align
    if order is not None: sh.name = f'reveal_{order:02d}'
    if name: sh.name = name
    return sh

def pic(s, path, x, y, w, h, order=None, name=None):
    sh = s.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w), Inches(h))
    if order is not None: sh.name = f'reveal_{order:02d}'
    if name: sh.name = name
    return sh

def ln(s, x1, y1, x2, y2, c=BORDER, width=1.0, name=None):
    sh = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    sh.line.color.rgb = rgb(c); sh.line.width = Pt(width)
    if name: sh.name = name
    return sh

def pill(s, x, y, w, h, c=TEAL, txt='', txt_c=BG, txt_sz=13, order=None, name=None):
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.adjustments[0] = 0.5
    sh.fill.solid(); sh.fill.fore_color.rgb = rgb(c); sh.line.fill.background()
    if txt:
        tf = sh.text_frame; tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]; p.text = txt; p.alignment = PP_ALIGN.CENTER
        p.font.name = 'Aptos'; p.font.size = Pt(txt_sz); p.font.bold = True; p.font.color.rgb = rgb(txt_c)
    if order is not None: sh.name = f'reveal_{order:02d}'
    if name: sh.name = name
    return sh

def add_chart(s, x, y, w, h, chart_type, categories, series_data,
              title=None, order=None, colors=None):
    """Add a styled chart to the slide."""
    from pptx.chart.data import CategoryChartData
    cd = CategoryChartData()
    cd.categories = categories
    for name, vals in series_data:
        cd.add_series(name, vals)
    chart_frame = s.shapes.add_chart(chart_type, Inches(x), Inches(y), Inches(w), Inches(h), cd)
    chart = chart_frame.chart
    if order is not None: chart_frame.name = f'chart_{order:02d}'

    # Style the chart area
    chart.chart_area.fill.solid()
    chart.chart_area.fill.fore_color.rgb = rgb(PANEL)
    chart.plot_area.fill.solid()
    chart.plot_area.fill.fore_color.rgb = rgb(PANEL)
    chart.chart_area.border.fill.background()
    chart.plot_area.border.fill.background()

    # Style gridlines
    try:
        chart.value_axis.major_gridlines.format.line.color.rgb = rgb(BORDER)
        chart.value_axis.major_gridlines.format.line.width = Pt(0.5)
    except: pass

    # Style axes
    try:
        for ax in [chart.value_axis, chart.category_axis]:
            ax.tick_labels.font.color.rgb = rgb(MUTED)
            ax.tick_labels.font.size = Pt(11)
            ax.tick_labels.font.name = 'Aptos'
            try: ax.format.line.fill.background()
            except: pass
    except: pass

    # Title
    if title:
        chart.has_title = True
        chart.chart_title.text_frame.text = title
        chart.chart_title.text_frame.paragraphs[0].font.color.rgb = rgb(OFF)
        chart.chart_title.text_frame.paragraphs[0].font.size = Pt(14)
        chart.chart_title.text_frame.paragraphs[0].font.bold = True
        chart.chart_title.text_frame.paragraphs[0].font.name = 'Aptos'
    else:
        chart.has_title = False

    # Legend
    try:
        chart.has_legend = len(series_data) > 1
        if chart.has_legend:
            chart.legend.font.color.rgb = rgb(MUTED)
            chart.legend.font.size = Pt(11)
            chart.legend.font.name = 'Aptos'
    except: pass

    # Color series bars/lines
    if colors is None:
        colors = [TEAL, BLUE, GOLD, RED, PURPLE]
    try:
        for i, (s_obj, c) in enumerate(zip(chart.series, colors[:len(chart.series)])):
            s_obj.format.fill.solid()
            s_obj.format.fill.fore_color.rgb = rgb(c)
            try: s_obj.format.line.fill.background()
            except: pass
            try:
                s_obj.data_labels.show_value = True
                s_obj.data_labels.font.color.rgb = rgb(WHITE)
                s_obj.data_labels.font.size = Pt(11)
                s_obj.data_labels.font.bold = True
                s_obj.data_labels.font.name = 'Aptos'
            except: pass
    except: pass

    return chart_frame

def notes(s, t):
    ns = s.notes_slide
    if ns.notes_text_frame is None:
        raw = '<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:nvSpPr><p:cNvPr id="900" name="Notes body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="13"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>'
        ns.shapes._spTree.insert_element_before(etree.fromstring(raw), 'p:extLst')
    ns.notes_text_frame.text = 'V4: ' + t

# ── Morph transition XML ───────────────────────────────────────────────────────
def add_morph_transition(s):
    """Add a PowerPoint Morph transition (requires Office 2019+/365)."""
    tr = OxmlElement('p:transition')
    tr.set('spd', 'fast')
    tr.set('advClick', '1')
    morph_el = etree.SubElement(tr, f'{{{NS_P14}}}morph')
    morph_el.set('option', 'byObject')
    s._element.append(tr)

def add_fade_transition(s):
    tr = OxmlElement('p:transition')
    tr.set('spd', 'med')
    tr.set('advClick', '1')
    tr.append(OxmlElement('p:fade'))
    s._element.append(tr)

def add_push_transition(s, dir='l'):
    tr = OxmlElement('p:transition')
    tr.set('spd', 'med')
    tr.set('advClick', '1')
    push = OxmlElement('p:push')
    push.set('dir', dir)
    tr.append(push)
    s._element.append(tr)

# ── Background decoration consistent across slides (helps Morph) ──────────────
def add_bg_decoration(s, slide_idx=0):
    """Add consistent background decoration named the same on all slides.
    Same-named shapes on consecutive slides are morphed by PowerPoint."""
    # Bottom teal accent line (consistent across all)
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(7.38), Inches(13.33), Inches(0.12))
    sh.name = 'bg-bottom-bar'  # same name on all slides for morph
    sh.fill.solid(); sh.fill.fore_color.rgb = rgb(TEAL2); sh.line.fill.background()

    # Top subtle accent
    sh2 = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.33), Inches(0.04))
    sh2.name = 'bg-top-bar'
    sh2.fill.solid(); sh2.fill.fore_color.rgb = rgb(BLUE2); sh2.line.fill.background()

    # Left vertical accent strip (slides this varies in position for morph effect)
    x_offsets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    sh3 = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(0.06), Inches(7.5))
    sh3.name = 'bg-left-bar'
    shade = [TEAL2, BLUE2, TEAL2, GOLD2, TEAL2, PURPLE, TEAL2, BLUE2, GOLD2, TEAL2, BLUE2, TEAL2, GOLD2, TEAL2]
    sh3.fill.solid(); sh3.fill.fore_color.rgb = rgb(shade[slide_idx % len(shade)]); sh3.line.fill.background()

# ── Heading helper ────────────────────────────────────────────────────────────
def slide_heading(s, title, subtitle=None, title_c=WHITE, sub_c=MUTED):
    """Full-width slide heading with consistent position."""
    tx(s, title, 0.75, 0.42, 11.8, 0.80, sz=36, c=title_c, b=True, order=1)
    if subtitle:
        tx(s, subtitle, 0.75, 1.20, 11.8, 0.42, sz=15, c=sub_c, order=1)

# ── Dot bullet helper ─────────────────────────────────────────────────────────
def bullet(s, text, x, y, w, c=TEAL, sz=15, order=None, dot_d=0.10):
    oval(s, x, y + 0.06, dot_d, c)
    tx(s, text, x + dot_d + 0.12, y, w, 0.38, sz=sz, c=OFF, order=order)

def bullet_with_label(s, label, body, x, y, w=5.5, c=TEAL, order=None):
    """Two-line bullet: colored bold label + muted body."""
    oval(s, x, y + 0.07, 0.10, c)
    tx(s, label, x + 0.24, y, w, 0.34, sz=16, c=WHITE, b=True, order=order)
    tx(s, body, x + 0.24, y + 0.38, w, 0.52, sz=13, c=MUTED, order=order, spacing=3)

# ── Stat card helper ──────────────────────────────────────────────────────────
def stat_card(s, x, y, w, h, label, value, unit='', c=TEAL, order=None):
    """A KPI/stat card with value prominently displayed."""
    rect(s, x, y, w, h, PANEL, r=0.08, border=BORDER, order=order)
    rect(s, x, y, w, 0.06, c, r=0, name=None)  # top color bar
    tx(s, label, x+0.20, y+0.22, w-0.4, 0.32, sz=13, c=MUTED, order=order)
    tx(s, value, x+0.20, y+0.52, w-0.4, 0.68, sz=36, c=c, b=True, order=order)
    if unit:
        tx(s, unit, x+0.20, y+1.18, w-0.4, 0.26, sz=12, c=MUTED, order=order)

# ── Flow step helper ──────────────────────────────────────────────────────────
def flow_step(s, x, y, w, h, num, label, desc, c=TEAL, order=None):
    """Numbered flow step card."""
    rect(s, x, y, w, h, PANEL, r=0.10, border=BORDER)
    # Number badge
    oval(s, x + 0.18, y + 0.18, 0.44, c)
    tx(s, str(num), x + 0.18, y + 0.22, 0.44, 0.34, sz=16, c=BG, b=True, align=PP_ALIGN.CENTER)
    tx(s, label, x+0.22, y+0.76, w-0.44, 0.38, sz=15, c=WHITE, b=True, order=order)
    tx(s, desc, x+0.22, y+1.14, w-0.44, 0.72, sz=12, c=MUTED, order=order, spacing=3)

# ── Arrow connector ───────────────────────────────────────────────────────────
def arr(s, x, y, c=TEAL, sz=22):
    tx(s, '→', x, y, 0.40, 0.40, sz=sz, c=c, b=True)

# ── Load v3 ───────────────────────────────────────────────────────────────────
P = Presentation(SOURCE)
print(f'Loaded {SOURCE} with {len(P.slides)} slides')

# ── Strip all transitions and background elements from all slides ─────────────
for s in P.slides:
    for el in list(s._element):
        if el.tag.endswith('}timing') or el.tag.endswith('}transition'):
            s._element.remove(el)
    set_bg(s)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — Cover: Full redesign with cinematic hero
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[0]
clear(s)

# Full-bleed hero illustration
if COVER_IMG.exists():
    pic(s, COVER_IMG, 0, 0, 13.33, 7.5, name='cover-hero')

# Gradient scrim from bottom — two layered dark rects for depth
sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(4.2), Inches(13.33), Inches(3.3))
sh.name = 'bg-scrim-1'; sh.fill.solid(); sh.fill.fore_color.rgb = rgb(DARK); sh.line.fill.background()
from pptx.oxml.ns import qn
# Set 60% transparency via XML
sp_pr = sh._element.find(qn('p:spPr'))
if sp_pr is not None:
    fld = sp_pr.find(f'{{{NS_A}}}solidFill')
    if fld is not None:
        srgb = fld.find(f'{{{NS_A}}}srgbClr')
        if srgb is not None:
            alpha = etree.SubElement(srgb, f'{{{NS_A}}}alpha')
            alpha.set('val', '75000')  # 75% opacity

# Left accent bar
add_bg_decoration(s, 0)

# Product name - large, bold, centered lower third
tx(s, 'FinBridge AI', 0.5, 4.72, 12.33, 1.15,
   sz=76, c=WHITE, b=True, align=PP_ALIGN.CENTER, name='cover-title')

# Tagline
tx(s, 'Cross-border student finance,  powered by AI',
   0.5, 5.78, 12.33, 0.55, sz=22, c=TEAL, align=PP_ALIGN.CENTER, name='cover-tagline')

# Decorative teal underline beneath title
ln(s, 4.2, 5.72, 9.13, 5.72, TEAL2, 1.5)

notes(s, 'Cover v4: cinematic full-bleed hero, 76pt product name, teal tagline, morph-ready decoration elements.')

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — Team: Premium two-card layout (preserve names from v3)
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[1]
existing = [sh.text.strip() for sh in s.shapes if sh.has_text_frame and sh.text.strip()]
name1 = next((t for t in existing if 'Jibon' in t), 'Md. Jibon Howlader')
role1 = next((t for t in existing if 'Development' in t), 'AI & Development')
name2 = next((t for t in existing if 'Munmun' in t or 'Meherun' in t), 'Meherun Nessa Munmun')
role2 = next((t for t in existing if 'Tester' in t), 'Tester & Data Manager')
clear(s)
add_bg_decoration(s, 1)

tx(s, 'Meet the team', 0.75, 0.38, 11.8, 0.80, sz=38, c=WHITE, b=True, order=1, name='slide-title')
tx(s, 'FinBridge AI — built at university', 0.75, 1.20, 11.8, 0.36, sz=15, c=MUTED, order=1)

for i, (name, role, conts, c) in enumerate([
    (name1, role1, ['AI tools & financial logic', 'Server actions & data integrity', 'Database design & API architecture'], TEAL),
    (name2, role2, ['Testing & quality assurance', 'Demo data management', 'User research & documentation'], BLUE),
]):
    cx = 0.85 + i * 6.25

    # Main card
    rect(s, cx, 2.05, 5.72, 4.60, PANEL, r=0.10, border=BORDER, order=2)
    # Colored top gradient bar
    rect(s, cx, 2.05, 5.72, 0.10, c, r=0, order=2)

    # Circular avatar placeholder
    oval(s, cx + 0.28, 2.28, 0.82, MID)
    oval(s, cx + 0.31, 2.31, 0.76, SURFACE)
    tx(s, name[0], cx + 0.28, 2.34, 0.82, 0.58, sz=26, c=c, b=True, align=PP_ALIGN.CENTER, order=2)

    # Name and role
    tx(s, name, cx + 1.25, 2.38, 4.20, 0.50, sz=22, c=WHITE, b=True, order=3)
    pill(s, cx + 1.25, 2.92, 2.6, 0.36, c=c, txt=role, txt_sz=12, txt_c=BG, order=3)

    # Divider
    ln(s, cx+0.28, 3.52, cx+5.40, 3.52, BORDER, 0.75)

    # Contribution bullets
    for j, line in enumerate(conts):
        yy = 3.72 + j * 0.58
        oval(s, cx + 0.30, yy + 0.08, 0.10, c)
        tx(s, line, cx + 0.55, yy, 4.95, 0.40, sz=14, c=OFF, order=4 + j)

ln(s, 0.75, 7.02, 12.58, 7.02, BORDER, 0.75)
tx(s, 'University project  ·  FinBridge AI  ·  2026', 0.75, 7.10, 11.83, 0.30,
   sz=12, c=DIM, align=PP_ALIGN.CENTER)
notes(s, 'Developer v4: premium circular avatar initials, pill badges, dot contributions, colored top bars.')

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — Problem statement: upgrade visual, keep illustration and bullets
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[2]
# Keep existing: only upgrade title styling and add decoration
for sh in list(s.shapes):
    if sh.has_text_frame and sh.name == 'reveal_01':
        sh.text_frame.paragraphs[0].font.size = Pt(36)
        sh.text_frame.paragraphs[0].font.name = 'Aptos Display'
add_bg_decoration(s, 2)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 4 — Real-world struggles: upgrade chart + add new illustration
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[3]
add_bg_decoration(s, 3)
# Upgrade chart styling — the existing chart is already there, we just ensure styling
for sh in s.shapes:
    if sh.has_chart:
        ch = sh.chart
        try:
            ch.chart_area.fill.solid(); ch.chart_area.fill.fore_color.rgb = rgb(PANEL)
            ch.plot_area.fill.solid(); ch.plot_area.fill.fore_color.rgb = rgb(PANEL)
            ch.chart_area.border.fill.background()
            ch.plot_area.border.fill.background()
        except: pass
        try:
            ch.value_axis.major_gridlines.format.line.color.rgb = rgb(BORDER)
            ch.value_axis.major_gridlines.format.line.width = Pt(0.5)
        except: pass
        try:
            for ax in [ch.value_axis, ch.category_axis]:
                ax.tick_labels.font.color.rgb = rgb(MUTED)
                ax.tick_labels.font.size = Pt(11)
        except: pass
        try:
            colors = [TEAL, MUTED, RED]
            for i, ser in enumerate(ch.series):
                if i < len(colors):
                    ser.format.fill.solid()
                    ser.format.fill.fore_color.rgb = rgb(colors[i])
                    try: ser.format.line.fill.background()
                    except: pass
                try:
                    ser.data_labels.show_value = True
                    ser.data_labels.font.color.rgb = rgb(WHITE)
                    ser.data_labels.font.size = Pt(10)
                    ser.data_labels.font.bold = True
                except: pass
        except: pass
    if sh.has_text_frame and sh.name == 'reveal_01':
        sh.text_frame.paragraphs[0].font.size = Pt(30)
        sh.text_frame.paragraphs[0].font.name = 'Aptos Display'

# Add struggles illustration in top-right if available
if STRUGGLES_IMG.exists():
    # Remove any existing picture in that area
    for sh in list(s.shapes):
        if sh.shape_type == 13 and sh.top/914400 < 2.0:
            delete(sh)
    pic(s, STRUGGLES_IMG, 6.80, 1.55, 6.30, 4.10, order=2)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 5 — Solution: Upgrade charts + add solution illustration
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[4]
add_bg_decoration(s, 4)
for sh in s.shapes:
    if sh.has_chart:
        ch = sh.chart
        try:
            ch.chart_area.fill.solid(); ch.chart_area.fill.fore_color.rgb = rgb(PANEL)
            ch.plot_area.fill.solid(); ch.plot_area.fill.fore_color.rgb = rgb(PANEL)
            ch.chart_area.border.fill.background(); ch.plot_area.border.fill.background()
        except: pass
        try:
            ch.value_axis.major_gridlines.format.line.color.rgb = rgb(BORDER)
        except: pass
        try:
            chart_colors = [TEAL, BLUE, GOLD, RED, MUTED]
            for i, ser in enumerate(ch.series):
                if i < len(chart_colors):
                    ser.format.fill.solid()
                    ser.format.fill.fore_color.rgb = rgb(chart_colors[i])
                try:
                    ser.data_labels.show_value = True
                    ser.data_labels.font.color.rgb = rgb(WHITE)
                    ser.data_labels.font.size = Pt(11)
                    ser.data_labels.font.bold = True
                except: pass
        except: pass
    if sh.has_text_frame and sh.name == 'reveal_01':
        sh.text_frame.paragraphs[0].font.size = Pt(28)
        sh.text_frame.paragraphs[0].font.name = 'Aptos Display'

if SOLUTION_IMG.exists():
    for sh in list(s.shapes):
        if sh.shape_type == 13 and sh.top/914400 < 2.0 and sh.left/914400 > 6.0:
            delete(sh)
    pic(s, SOLUTION_IMG, 7.10, 1.55, 5.90, 3.70, order=2)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 6 — AI implementation: upgrade visual + add AI illustration
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[5]
add_bg_decoration(s, 5)
if AI_IMG.exists():
    for sh in list(s.shapes):
        if sh.shape_type == 13 and sh.top/914400 >= 2.0 and sh.top/914400 <= 2.3:
            delete(sh)
    pic(s, AI_IMG, 0.50, 2.05, 6.20, 4.10, order=2)
for sh in s.shapes:
    if sh.has_text_frame and sh.name == 'reveal_01':
        sh.text_frame.paragraphs[0].font.size = Pt(28)
        sh.text_frame.paragraphs[0].font.name = 'Aptos Display'

# ══════════════════════════════════════════════════════════════════════════════
# SLIDES 7-9 — Feature slides: upgrade chart styles
# ══════════════════════════════════════════════════════════════════════════════
feat_colors = [[TEAL, BLUE, GOLD], [GOLD, TEAL, BLUE], [BLUE, GOLD, TEAL]]
for si, feature_colors in zip([6, 7, 8], feat_colors):
    s = P.slides[si]
    add_bg_decoration(s, si)
    for sh in s.shapes:
        if sh.has_chart:
            ch = sh.chart
            try:
                ch.chart_area.fill.solid(); ch.chart_area.fill.fore_color.rgb = rgb(PANEL)
                ch.plot_area.fill.solid(); ch.plot_area.fill.fore_color.rgb = rgb(PANEL)
                ch.chart_area.border.fill.background(); ch.plot_area.border.fill.background()
            except: pass
            try:
                ch.value_axis.major_gridlines.format.line.color.rgb = rgb(BORDER)
                ch.value_axis.major_gridlines.format.line.width = Pt(0.5)
                for ax in [ch.value_axis, ch.category_axis]:
                    ax.tick_labels.font.color.rgb = rgb(MUTED)
                    ax.tick_labels.font.size = Pt(11)
            except: pass
            try:
                for i, ser in enumerate(ch.series):
                    if i < len(feature_colors):
                        ser.format.fill.solid()
                        ser.format.fill.fore_color.rgb = rgb(feature_colors[i])
                    try:
                        ser.data_labels.show_value = True
                        ser.data_labels.font.color.rgb = rgb(WHITE)
                        ser.data_labels.font.size = Pt(11)
                        ser.data_labels.font.bold = True
                    except: pass
            except: pass
        if sh.has_text_frame and sh.name == 'reveal_01':
            sh.text_frame.paragraphs[0].font.size = Pt(34)
            sh.text_frame.paragraphs[0].font.name = 'Aptos Display'

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 10 — Common features: upgrade styling
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[9]
add_bg_decoration(s, 9)
for sh in s.shapes:
    if sh.has_text_frame and sh.name == 'reveal_01':
        sh.text_frame.paragraphs[0].font.size = Pt(34)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 11 — Security & Privacy: upgrade styling
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[10]
add_bg_decoration(s, 10)
for sh in s.shapes:
    if sh.has_text_frame and sh.name == 'reveal_01':
        sh.text_frame.paragraphs[0].font.size = Pt(34)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 12 — Business model: rebuild pricing cards with upgraded design
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[11]
add_bg_decoration(s, 11)
# Upgrade plan card styling: add glow borders to existing cards
for sh in s.shapes:
    if sh.has_text_frame and sh.name == 'reveal_01':
        sh.text_frame.paragraphs[0].font.size = Pt(34)
    # Upgrade the big price numbers
    if sh.has_text_frame and sh.name in ['reveal_03', 'reveal_04', 'reveal_05']:
        for p in sh.text_frame.paragraphs:
            try:
                val = p.text.strip()
                if val.isdigit() and len(val) in [3, 4]:
                    p.font.size = Pt(52)
                    p.font.bold = True
            except: pass

# Add glow borders to plan cards by overlaying thin border rects
plan_xs = [0.65, 4.85, 9.05]
plan_colors = [TEAL, BLUE, PURPLE]
for px, pc in zip(plan_xs, plan_colors):
    rect(s, px, 2.30, 3.58, 2.72, None, r=0.10, border=pc)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 13 — Business strategy: upgrade roadmap visual
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[12]
add_bg_decoration(s, 12)
for sh in s.shapes:
    if sh.has_text_frame and sh.name == 'reveal_01':
        sh.text_frame.paragraphs[0].font.size = Pt(34)
# Add connecting flow line under the three cards
ln(s, 0.95, 5.95, 12.10, 5.95, BORDER, 1.0)
# Phase number badges overlaid on connecting line
for i, (pc, label) in enumerate([(BLUE, '01'), (GOLD, '02'), (TEAL, '03')]):
    ox = 1.55 + i * 4.20
    oval(s, ox, 5.65, 0.52, pc)
    tx(s, label, ox, 5.69, 0.52, 0.36, sz=14, c=BG, b=True, align=PP_ALIGN.CENTER)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 14 — Thank You: upgrade with enhanced design
# ══════════════════════════════════════════════════════════════════════════════
s = P.slides[13]
add_bg_decoration(s, 13)
# Upgrade existing text styling
for sh in s.shapes:
    if sh.has_text_frame:
        for p in sh.text_frame.paragraphs:
            if p.text.strip() == 'Thank You':
                p.font.size = Pt(80)
                p.font.name = 'Aptos Display'
# Add decorative element: a mint horizontal divider above tagline
ln(s, 2.5, 6.42, 10.83, 6.42, TEAL2, 1.5)

# ══════════════════════════════════════════════════════════════════════════════
# APPLY TRANSITIONS
# Morph on all middle slides, fade on cover + thank you
# ══════════════════════════════════════════════════════════════════════════════
for idx, s in enumerate(P.slides):
    set_bg(s)
    if idx in [0, 13]:  # cover + thank you = cinematic fade
        add_fade_transition(s)
    else:  # everything else = morph (silky smooth)
        add_morph_transition(s)

# ══════════════════════════════════════════════════════════════════════════════
# SAVE
# ══════════════════════════════════════════════════════════════════════════════
OUT = Path('presentation-deck-v4.pptx')
P.core_properties.title = 'FinBridge AI — Presentation v4'
P.core_properties.comments = (
    'V4: upgraded design system, morph transitions, new illustrations, '
    'enhanced charts, consistent bg decoration, cinematic cover and thank you.'
)
P.save(str(OUT))
print(f'Saved {OUT} with {len(P.slides)} slides.')

