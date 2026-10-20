from pathlib import Path
import sys,json,re,hashlib
sys.path.insert(0,str(Path('.local/presentation-tools').resolve()))
from pptx import Presentation
from pptx.util import Inches,Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE,MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN
from pptx.enum.chart import XL_CHART_TYPE,XL_LABEL_POSITION
from pptx.chart.data import CategoryChartData
from pptx.oxml.xmlchemy import OxmlElement

OUT=Path('presentation/v2');AS=OUT/'assets';SOURCE=OUT/'user-edited-source.pptx'
expected=(OUT/'source-sha256.txt').read_text().strip()
assert hashlib.sha256(Path('presentation-deck.pptx').read_bytes()).hexdigest()==expected,'User source changed. Refresh the snapshot before rebuilding.'
P=Presentation(SOURCE);BG='080F1B';PANEL='101E30';SOFT='172A40';GRID='263951';WHITE='EDF5FF';MUTED='A2B4CA';TEAL='63E6BE';BLUE='6BB9FF';GOLD='F3C969';RED='FF8896';PURPLE='B4A3FF'
changes=[]
def rgb(c):return RGBColor.from_string(c)
def delete(sh):sh._element.getparent().remove(sh._element)
def clear(s):
 for sh in list(s.shapes):delete(sh)
 for el in list(s._element):
  if el.tag.endswith('}timing') or el.tag.endswith('}transition'):s._element.remove(el)

def box(s,x,y,w,h,c=PANEL,order=None,line=None):
 sh=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,Inches(x),Inches(y),Inches(w),Inches(h));sh.adjustments[0]=.09;sh.fill.solid();sh.fill.fore_color.rgb=rgb(c);sh.line.fill.background()
 if line:sh.line.color.rgb=rgb(line)
 if order is not None:sh.name=f'reveal_{order:02d}'
 return sh

def tx(s,t,x,y,w,h,sz=18,c=WHITE,b=False,order=None,align=None):
 sh=s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h));tf=sh.text_frame;tf.word_wrap=True;tf.margin_left=tf.margin_right=tf.margin_top=tf.margin_bottom=0
 for i,row in enumerate(t.split('\n')):
  p=tf.paragraphs[0] if i==0 else tf.add_paragraph();p.text=row;p.font.name='Aptos';p.font.size=Pt(sz);p.font.bold=b;p.font.color.rgb=rgb(c);p.space_after=Pt(4)
  if align is not None:p.alignment=align
 if order is not None:sh.name=f'reveal_{order:02d}'
 return sh

def picture(s,path,x,y,w,h,order=2):
 sh=s.shapes.add_picture(str(path),Inches(x),Inches(y),Inches(w),Inches(h));sh.name=f'reveal_{order:02d}';return sh

def line(s,x1,y1,x2,y2,c=GRID,width=2):
 sh=s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,Inches(x1),Inches(y1),Inches(x2),Inches(y2));sh.line.color.rgb=rgb(c);sh.line.width=Pt(width);return sh

def dot(s,x,y,d,c):
 sh=s.shapes.add_shape(MSO_SHAPE.OVAL,Inches(x),Inches(y),Inches(d),Inches(d));sh.fill.solid();sh.fill.fore_color.rgb=rgb(c);sh.line.fill.background();return sh

def title(s,t):tx(s,t,.65,.55,12.0,.72,32,WHITE,True,1)
def notes(s,t,append=True):
 if any(s is existing for existing in list(P.slides)[:3]):append=False
 ns=s.notes_slide
 if ns.notes_text_frame is None:
  from lxml import etree
  raw='<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:nvSpPr><p:cNvPr id="900" name="Notes body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="13"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>'
  ns.shapes._spTree.insert_element_before(etree.fromstring(raw),'p:extLst')
 prev=ns.notes_text_frame.text if append else ''
 ns.notes_text_frame.text=prev+'\n\nV2 REVISION: '+t

def arrow(s,x,y,c=TEAL,w=.40):tx(s,'→',x,y,w,.42,25,c,True)
def new(t):
 s=P.slides.add_slide(P.slide_layouts[6]);s.background.fill.solid();s.background.fill.fore_color.rgb=rgb(BG);title(s,t);return s

def remove_picture_area(s,miny,maxy):
 for sh in list(s.shapes):
  if sh.shape_type==13 and miny<=sh.top/914400<=maxy:delete(sh)

def claim_card(s,label,body,x,y,w=5.05,c=TEAL,order=3):
 dot(s,x,y+.06,.12,c);tx(s,label,x+.33,y,w-.33,.39,20,WHITE,True,order);tx(s,body,x+.33,y+.54,w-.33,.64,14,MUTED,order=order)

# Keep the user's order and all existing text/layout unless requested below.
# Remove only the redundant outer slide furniture globally.
for idx,s in enumerate(P.slides):
 for sh in list(s.shapes):
  if not sh.has_text_frame:continue
  v=sh.text.strip();yy=sh.top/914400
  if (yy<.65 and idx>0) or re.fullmatch(r'\d+\s*/\s*\d+',v) or (v=='FINBRIDGE AI' and yy>6.8):delete(sh);continue
  if sh.name=='reveal_01' and idx>0:sh.top=Inches(.55)
  elif abs(yy-1.52)<.03:sh.top=Inches(1.28)
 # Timing targets are rebuilt after edited shapes have been removed.
 for el in list(s._element):
  if el.tag.endswith('}timing') or el.tag.endswith('}transition'):s._element.remove(el)
changes.append('Across all slides: removed the small top section labels, slide numbering and redundant bottom brand furniture. Retained main titles and existing content; rebuilt valid animations after layout edits.')

# 1. Full-width human illustration, logo and title; no tagline.
s=P.slides[0];clear(s)
picture(s,'src/assets/finbridge-logo.png',.65,.46,1.10,1.10,1)
tx(s,'FinBridge AI',1.90,.57,10.5,1.02,53,WHITE,True,1)
picture(s,AS/'finance-before-after.png',.37,2.04,12.60,4.725,2)
notes(s,'Cover rebuilt with the new bridge/open-book logo and a human before/after funding illustration. Removed the sentence beneath the product title as requested. Illustration: concerned student with fragmented family funding becomes a calm student with a clear tuition plan. Image generated using the built-in image generator; no product code references the logo.')
changes.append('Cover: removed the tagline and generic wallet animation; added a project logo plus a full-width before/after human illustration.')

# 2. Preserve the user's moved-up developer slide. Return to two large cards, without avatars.
s=P.slides[1]
oldtexts=[q.text for q in s.shapes if q.has_text_frame]
name1=next((t for t in oldtexts if t=='Developer 1'),'Developer 1');name2=next((t for t in oldtexts if t=='Developer 2'),'Developer 2')
role1=next((t for t in oldtexts if 'AI & Backend' in t),'AI & Backend');role2=next((t for t in oldtexts if 'Frontend & UX' in t),'Frontend & UX')
clear(s);title(s,'The team behind FinBridge AI')
for i,(name,role,lines,c) in enumerate([(name1,role1,['AI tools + financial logic','Server actions + data integrity'],TEAL),(name2,role2,['Dashboards + user workflows','Interaction + visual design'],BLUE)]):
 x=.78+i*6.17;box(s,x,2.08,5.60,3.78,PANEL,2+i)
 box(s,x+.28,2.41,.67,.08,c)
 tx(s,name,x+.35,2.97,4.90,.59,30,WHITE,True,3+i)
 tx(s,role,x+.35,3.77,4.90,.42,21,c,order=4+i)
 tx(s,'\n'.join(lines),x+.35,4.62,4.90,.90,16,MUTED,order=5+i)
notes(s,'Developer slide remains second, preserving the user\'s reorder. Both avatars removed. Restored the first version\'s balanced two-card presentation. Existing name/role placeholders retained. Contribution lines are suggested demo responsibilities, not verified contributor attribution.')
changes.append('Developer slide remains slide 2. Removed both avatars and the small demo reminder; restored two large equal cards with the existing names and roles.')

# 3. Explain the actual problem before showing calculations later.
s=P.slides[2];clear(s);title(s,'Problem statement')
picture(s,AS/'student-funding-problem.png',.40,1.67,6.82,4.55,2)
claim_card(s,'Money is fragmented.','Family funding and student balances sit in different accounts and currencies.',7.48,1.95,5.03,BLUE,3)
claim_card(s,'Deadlines compete.','Rent and living costs reduce the money available for tuition.',7.48,3.34,5.03,GOLD,4)
claim_card(s,'No shared funding plan.','How much is missing, who should act, and when must the money arrive?',7.48,4.73,5.03,RED,5)
tx(s,'Can we fund tuition on time without running short on living costs?',.73,6.62,11.9,.43,21,TEAL,True,6)
notes(s,'The old funding chart has been removed from the problem statement at the user\'s request. The problem is now framed directly with a human illustration and three root causes: fragmented currencies/accounts, competing tuition/living expenses and unclear family coordination. The user-edited funding calculations remain in the later real-world and solution slides; deleted numerical labels from the edited problem slide were not restored.')
changes.append('Problem statement: replaced the waterfall/readiness graphic with an illustrated student/family problem and three concrete causes. The later financial scenario stays intact.')

# 6 (source order). Replace a tiny animated chat with a larger editable prompt-to-plan visual.
s=P.slides[5];remove_picture_area(s,2.0,2.2)
box(s,.55,2.10,6.56,3.88,PANEL,2)
tx(s,'“Can I afford my next tuition bill?”',.83,2.39,5.98,.52,22,WHITE,True,2)
for i,(a,b,c) in enumerate([('Read','Accounts + tuition invoice',BLUE),('Calculate','CNY 6,750 funding gap',RED),('Propose','CNY 3,375 monthly target',TEAL)]):
 yy=3.22+i*.70;box(s,.86,yy,1.22,.43,SOFT,3+i);tx(s,a,.95,yy+.08,1.02,.24,12,c,True,3+i,PP_ALIGN.CENTER);tx(s,b,2.30,yy+.04,4.43,.38,17,WHITE,order=3+i)
box(s,4.49,5.50,2.28,.36,TEAL,6);tx(s,'Review before saving',4.62,5.55,2.02,.25,12,BG,True,6,PP_ALIGN.CENTER)
notes(s,'The AI figure is now an editable prompt/read/calculate/propose/review diagram with progressive reveals. The existing tool graph, provider list, architecture and wording remain preserved.')
changes.append('AI implementation: replaced the small raster tool-run panel with an editable, readable question-to-reviewed-plan diagram. Existing right-side tool content stays unchanged.')

# 8. Make the parent approval path readable at presentation scale.
s=P.slides[7];remove_picture_area(s,4.6,5.0)
box(s,.55,4.77,6.30,2.10,PANEL,3)
tx(s,'Student requests CNY 6,750',.82,5.02,5.76,.43,20,WHITE,True,3)
for i,(a,b,c) in enumerate([('Student','Confirms request',BLUE),('Parent','Reviews + decides',GOLD),('Payment','Queues if approved',TEAL)]):
 x=.80+i*2.02;box(s,x,5.78,1.78,.80,SOFT,4+i);tx(s,a,x+.08,5.93,1.62,.24,14,c,True,4+i,PP_ALIGN.CENTER);tx(s,b,x+.06,6.27,1.66,.23,10,MUTED,order=4+i,align=PP_ALIGN.CENTER)
 if i<2:arrow(s,x+1.80,5.99,w=.22)
notes(s,'Parent approval figure is now an editable three-step request/decision/queue diagram. The existing threshold chart, policy limits and complete parent feature list are preserved.')

# 9. Editable settlement lanes make the administrative task recognizable.
s=P.slides[8];remove_picture_area(s,2.0,2.2)
box(s,.55,2.10,6.30,2.65,PANEL,2)
tx(s,'Manual settlement',.82,2.33,5.78,.35,18,WHITE,True,2)
for i,(a,b,c) in enumerate([('Queued','Review request',GOLD),('Processing','Add payout reference',BLUE),('Completed','Record receipt',TEAL)]):
 x=.80+i*2.02;box(s,x,2.99,1.78,1.40,SOFT,3+i);tx(s,a,x+.06,3.16,1.66,.27,13,c,True,3+i,PP_ALIGN.CENTER);tx(s,b,x+.13,3.69,1.52,.52,12,WHITE,order=3+i,align=PP_ALIGN.CENTER)
 if i<2:arrow(s,x+1.80,3.51,w=.22)
notes(s,'Administrative illustration now has three large editable settlement lanes with explicit moderator tasks. Native queue chart and feature text are unchanged.')

# 10 source / 11 final. A readable disclosure matrix shows actual privacy behavior.
s=P.slides[9];remove_picture_area(s,2.0,2.2)
box(s,.55,2.10,7.20,4.26,PANEL,2)
tx(s,'What a parent can see',.84,2.34,6.60,.43,21,WHITE,True,2)
for x,t,c in [(1.00,'Financial detail',MUTED),(3.61,'Student',BLUE),(5.60,'Parent',TEAL)]:tx(s,t,x,3.12,1.78,.30,14,c,True,3)
for i,(lab,val,pval,c) in enumerate([('Balance','CNY 27,500','CNY 27,500',TEAL),('Tuition due','CNY 40,000','CNY 40,000',TEAL),('Description','Personal purchase','Not shared',RED)]):
 yy=3.76+i*.70;line(s,.88,yy-.14,7.39,yy-.14);tx(s,lab,1.00,yy,2.2,.34,15,WHITE,order=4+i);tx(s,val,3.61,yy,1.80,.44,13,WHITE,order=4+i);tx(s,pval,5.60,yy,1.70,.44,13,c,True,4+i)
tx(s,'Visibility is configurable for every linked family.',.99,6.00,6.20,.24,12,MUTED,order=7)
notes(s,'Privacy figure rebuilt as a readable editable student/parent disclosure matrix: balances and tuition can be shared while descriptions stay private. This is illustrative, not a statement about the current demo account\'s permissions. Existing security control descriptions remain unchanged.')
changes.append('Parent, admin and security figures are now large editable action/disclosure diagrams, preserving their existing charts and feature/security wording.')

# New common-features slide. Only supported demo role selectors are shown.
s=new('Common features')
for x,t in [(.65,'Language'),(4.85,'Appearance'),(9.05,'Learn the platform')]:tx(s,t,x,1.83,3.61,.40,21,WHITE,True,2)
for i,(lab,c) in enumerate([('English',TEAL),('Bengali',BLUE),('Chinese',PURPLE)]):
 box(s,.65,2.45+i*.57,3.58,.43,SOFT,3+i);tx(s,lab,.87,2.52+i*.57,3.15,.27,15,c,True,3+i)
for i,(lab,c) in enumerate([('Light',MUTED),('Dark',TEAL),('System',MUTED)]):
 yy=2.45+i*.57;box(s,4.85,yy,3.58,.43,SOFT,3+i);dot(s,7.92,yy+.13,.17,c);tx(s,lab,5.06,yy+.07,2.60,.28,15,c,True,3+i)
for i,t in enumerate(['Features','How it works','Security & privacy']):
 yy=2.45+i*.57;box(s,9.05,yy,3.58,.43,SOFT,3+i);tx(s,t,9.26,yy+.07,3.12,.28,14,WHITE,order=3+i)
line(s,.65,4.55,12.63,4.55)
tx(s,'Try the main roles with demo access',.65,4.88,11.90,.47,25,WHITE,True,5)
for i,(a,b,c) in enumerate([('Student','Plans, spending and AI',BLUE),('Parent','Funding and approvals',GOLD),('Admin','Policies and settlements',TEAL)]):
 x=.65+i*4.20;box(s,x,5.66,3.58,.95,PANEL,6+i);tx(s,a,x+.20,5.84,3.18,.31,19,c,True,6+i);tx(s,b,x+.20,6.28,3.18,.24,12,MUTED,order=6+i)
tx(s,'/en/demo  ·  Simulated money  ·  Local mock AI needs no provider key',.68,6.94,11.94,.26,11,MUTED)
notes(s,'New common-features slide. Languages from src/lib/i18n.ts and src/dictionaries; theme modes from UI providers/preferences. Learning routes /en/features, /en/how-it-works, /en/security and /en/privacy exist in the page dispatcher. /en/demo exposes exactly Student, Parent and Admin buttons when DEMO_MODE=true; moderator role uses normal assigned accounts and is not represented as a demo selector. No demo passwords or API secrets appear. Deterministic mock AI supports no-key demonstrations.',False)
# Place common features immediately after role features and before security.
common_id=P.slides._sldIdLst[-1];P.slides._sldIdLst.remove(common_id);P.slides._sldIdLst.insert(9,common_id)

# New business model: existing sandbox plans, not invented traction.
s=new('Business model')
tx(s,'Subscriptions matched to student and family needs.',.67,1.43,11.90,.47,22,MUTED)
plans=[('Student','299','Everyday finance planning',TEAL),('Pro','699','Higher AI and workflow limits',BLUE),('Family','999','Parent–student coordination',PURPLE)]
for i,(name,price,benefit,c) in enumerate(plans):
 x=.65+i*4.20;box(s,x,2.32,3.58,2.66,PANEL,2+i);tx(s,name,x+.26,2.62,3.06,.36,20,c,True,2+i);tx(s,price,x+.26,3.19,3.06,.72,43,WHITE,True,3+i);tx(s,'BDT / month',x+.26,3.99,3.06,.28,13,MUTED);tx(s,benefit,x+.26,4.45,3.06,.43,13,WHITE,order=4+i)
box(s,.65,5.40,11.98,1.06,SOFT,5)
tx(s,'7-day trial',.91,5.71,2.64,.38,21,TEAL,True,5);arrow(s,3.49,5.65,w=.45);tx(s,'Monthly or annual plan',4.15,5.75,4.18,.35,19,WHITE,True,6);arrow(s,8.69,5.65,w=.45);tx(s,'Higher usage limits',9.38,5.75,2.96,.35,17,WHITE,True,7)
tx(s,'Core costs: AI usage, hosting and support.',.69,6.84,7.92,.30,14,MUTED)
tx(s,'Existing sandbox plan prices',9.20,6.89,3.37,.24,10,MUTED,align=PP_ALIGN.RIGHT)
notes(s,'New business model slide describes the subscription mechanism implemented in the repository, not actual revenue. Source: scripts/generate-demo.mjs plans and plan_prices: 7-day trial; Student BDT299/mo or 2990/year, Pro699/mo or6990/year, Family999/mo or9990/year. Quotas vary across accounts, AI messages, transfer simulations, tuition plans, CSV imports and family links. Payment is sandbox checkout. AI/hosting/support are qualitative anticipated operating costs; no unit-cost, margin, traction or profitability claims are made.',False)

# New strategy: a proposed rollout, without unsupported partnerships or growth metrics.
s=new('Business strategy')
tx(s,'Start with the Bangladesh–China student and family journey.',.67,1.44,11.90,.46,22,MUTED)
strategy=[('Validate','Student + parent interviews','Test tuition planning and guided demos.','Measure: plans created',BLUE),('Pilot','Campus and student groups','Trial the family approval workflow.','Measure: review completion',GOLD),('Grow','Repeat use and referrals','Improve retention before expanding corridors.','Measure: conversion + retention',TEAL)]
for i,(a,b,c,d,col) in enumerate(strategy):
 x=.65+i*4.20;box(s,x,2.35,3.58,3.45,PANEL,2+i);tx(s,a,x+.25,2.70,3.08,.45,28,col,True,2+i);tx(s,b,x+.25,3.47,3.08,.57,17,WHITE,True,3+i);tx(s,c,x+.25,4.23,3.08,.84,15,MUTED,order=4+i);tx(s,d,x+.25,5.25,3.08,.40,11,col,order=5+i)
 if i<2:arrow(s,x+3.70,3.80,w=.39)
line(s,.68,6.24,12.62,6.24)
tx(s,'Proposed rollout',.69,6.55,3.0,.33,17,TEAL,True)
tx(s,'Pilot partnerships and live-payment integrations remain future work.',4.02,6.59,8.57,.40,14,MUTED)
notes(s,'New strategy slide is explicitly a proposal, not evidence of existing university partnerships, customers, market share or validated growth. Initial corridor aligns with the current China/Bangladesh product focus. The sequence is user discovery, campus/student-group pilots and retention-led expansion. Measures are proposed metrics, with no fabricated targets or achieved values. Live payment-network integration and independent production/security review remain future work.',False)
changes.extend(['Added Common features before Security & privacy: three languages, Light/Dark/System appearance, learning pages and the three supported demo roles.','Added Business model with actual sandbox subscription tiers, qualitative costs and monthly/annual conversion flow.','Added Business strategy as an explicitly proposed validate/pilot/grow rollout; no invented market, partnership or revenue claims.'])

# Every slide retains the full dark theme and gets a valid native transition.
for s in P.slides:
 s.background.fill.solid();s.background.fill.fore_color.rgb=rgb(BG)
 tr=OxmlElement('p:transition');tr.set('spd','med');tr.set('advClick','1');tr.append(OxmlElement('p:fade'));s._element.append(tr)
P.core_properties.title='FinBridge AI — Presentation v2';P.core_properties.comments='Based on the user-edited presentation. Source preserved in presentation/v2/user-edited-source.pptx.'
P.save('presentation-deck-v2.pptx')
(OUT/'changes.json').write_text(json.dumps({'source_sha256':expected,'source_slides':10,'output_slides':len(P.slides),'changes':changes},indent=2),encoding='utf-8')
print('Saved presentation-deck-v2.pptx with',len(P.slides),'slides; original source remains unchanged.')
