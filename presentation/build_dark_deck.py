from pathlib import Path
import sys,math,json
from decimal import Decimal,ROUND_HALF_UP
sys.path.insert(0,str(Path('.local/presentation-tools').resolve()))
from PIL import Image,ImageDraw,ImageFont
from pptx import Presentation
from pptx.util import Inches,Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE,MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN
from pptx.enum.chart import XL_CHART_TYPE,XL_LABEL_POSITION,XL_LEGEND_POSITION
from pptx.chart.data import CategoryChartData
from pptx.oxml.xmlchemy import OxmlElement

ROOT=Path('presentation');OUT=ROOT/'dark-assets';OUT.mkdir(exist_ok=True)
OLD=Presentation(str(ROOT/'previous-deck.pptx'))
NOTES=[s.notes_slide.notes_text_frame.text for s in OLD.slides]
P=Presentation();P.slide_width=Inches(13.333);P.slide_height=Inches(7.5)
P.core_properties.title='FinBridge AI — Project Presentation';P.core_properties.author='FinBridge AI Project Team'
BG='080F1B';PANEL='101E30';SOFT='172A40';GRID='263951';WHITE='EDF5FF';MUTED='A2B4CA';TEAL='63E6BE';BLUE='6BB9FF';PURPLE='B4A3FF';GOLD='F3C969';RED='FF8896'
D=Decimal
providers=[('StudentTransfer',200,.002,.003),('GlobeSend',100,.004,.005),('FastRemit',400,.005,.006),('SwiftBank',1600,.006,.012)]
quotes=[]
for name,fee,pct,spread in providers:
 rate=D('5.21')/D('88.5')*(1-D(str(spread)))
 principal=(D('6750')/rate).quantize(D('.01'),rounding=ROUND_HALF_UP)
 charge=principal*D(str(pct))+D(fee)
 total=(principal+charge).quantize(D('.01'),rounding=ROUND_HALF_UP)
 quotes.append((name,float(total),float(charge.quantize(D('.01')))))
quotes.sort(key=lambda a:a[1])
(OUT/'chart-data.json').write_text(json.dumps({'scenario':{'currency':'CNY','tuition':40000,'available':27500,'monthly_income':5000,'monthly_living':2125,'months':2,'projected':33250,'gap':6750,'monthly_target':3375},'quotes_BDT_for_6750_CNY':quotes,'source':'src/lib/money.ts; src/services/remittance.service.ts; scripts/generate-demo.mjs'},indent=2),encoding='utf-8')

def rgb(c):return RGBColor.from_string(c)
def box(s,x,y,w,h,c=PANEL,r=.10,name=None,outline=None):
 sh=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x),Inches(y),Inches(w),Inches(h));sh.fill.solid();sh.fill.fore_color.rgb=rgb(c);sh.line.fill.background();sh.adjustments[0]=r
 if outline:sh.line.color.rgb=rgb(outline)
 if name:sh.name=name
 return sh

def text(s,t,x,y,w,h,size=18,c=WHITE,b=False,order=None,align=None):
 sh=s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h));tf=sh.text_frame;tf.word_wrap=True;tf.margin_top=tf.margin_bottom=tf.margin_left=tf.margin_right=0
 for i,row in enumerate(t.split('\n')):
  p=tf.paragraphs[0] if i==0 else tf.add_paragraph();p.text=row;p.font.name='Aptos';p.font.size=Pt(size);p.font.bold=b;p.font.color.rgb=rgb(c);p.space_after=Pt(3)
  if align is not None:p.alignment=align
 if order is not None:sh.name=f'reveal_{order:02d}'
 return sh

def line(s,x1,y1,x2,y2,c=GRID,width=1.5):
 sh=s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1),Inches(y1),Inches(x2),Inches(y2));sh.line.color.rgb=rgb(c);sh.line.width=Pt(width);return sh

def dot(s,x,y,d,c):
 sh=s.shapes.add_shape(MSO_SHAPE.OVAL,Inches(x),Inches(y),Inches(d),Inches(d));sh.fill.solid();sh.fill.fore_color.rgb=rgb(c);sh.line.fill.background();return sh

def tag(s,t,x,y,w,c=TEAL):
 box(s,x,y,w,.32,c);text(s,t,x+.08,y+.045,w-.16,.23,10,BG,True)

def new(title=None,section=None,sub=None):
 s=P.slides.add_slide(P.slide_layouts[6]);s.background.fill.solid();s.background.fill.fore_color.rgb=rgb(BG)
 if title:
  text(s,section.upper(),.55,.30,11,.25,10,TEAL,True)
  text(s,title,.55,.84,12.2,.67,31,WHITE,True,1)
  if sub:text(s,sub,.57,1.52,12,.45,13,MUTED)
  text(s,'FINBRIDGE AI',.55,7.12,4,.20,9,MUTED)
  text(s,f'{len(P.slides):02d} / 10',11.6,7.08,1.18,.25,10,MUTED,align=PP_ALIGN.RIGHT)
 return s

def note(s,oldidx,extra):
 base=NOTES[oldidx-1].split('\nAnimation:')[0] if oldidx else ''
 s.notes_slide.notes_text_frame.text=extra+'\n\n'+base+'\n\nThis dark visual edition uses explicit example data and staged workflow animations. The story is an illustrative scenario, not an interviewed person. All payments and quotes are sandbox simulations. Captures labeled Actual demo UI show the local demo interface. Native charts and numeric labels remain editable.'

def chart(s,kind,x,y,w,h,cats,series,colors,order=3,legend=False,maxv=None):
 data=CategoryChartData();data.categories=cats
 for label,values in series:data.add_series(label,values)
 typ={'bar':XL_CHART_TYPE.BAR_CLUSTERED,'stack':XL_CHART_TYPE.BAR_STACKED,'column':XL_CHART_TYPE.COLUMN_CLUSTERED,'line':XL_CHART_TYPE.LINE,'donut':XL_CHART_TYPE.DOUGHNUT}[kind]
 sh=s.shapes.add_chart(typ, Inches(x), Inches(y), Inches(w), Inches(h),data);sh.name=f'chart_{order:02d}'
 ch=sh.chart;ch.has_title=False;ch.has_legend=legend;ch.font.name='Aptos';ch.font.size=Pt(11);ch.font.color.rgb=rgb(MUTED)
 if legend:ch.legend.position=XL_LEGEND_POSITION.BOTTOM;ch.legend.include_in_layout=False;ch.legend.font.size=Pt(10);ch.legend.font.color.rgb=rgb(MUTED)
 for i,ser in enumerate(ch.series):
  if kind=='line':ser.format.line.color.rgb=rgb(colors[i%len(colors)]);ser.format.line.width=Pt(3)
  else:
   ser.format.fill.solid();ser.format.fill.fore_color.rgb=rgb(colors[i%len(colors)]);ser.format.line.fill.background()
   if len(series)==1:
    for j,pt in enumerate(ser.points):pt.format.fill.solid();pt.format.fill.fore_color.rgb=rgb(colors[j%len(colors)]);pt.format.line.fill.background()
 if kind=='donut':ch.plots[0].hole_size=78;ch.plots[0].first_slice_angle=270
 else:
  ch.category_axis.tick_labels.font.size=Pt(11);ch.category_axis.tick_labels.font.color.rgb=rgb(MUTED);ch.category_axis.format.line.fill.background()
  ch.value_axis.tick_labels.font.size=Pt(10);ch.value_axis.tick_labels.font.color.rgb=rgb(MUTED);ch.value_axis.format.line.fill.background()
  ch.value_axis.minimum_scale=0
  ch.value_axis.has_major_gridlines=(kind in ['line','column'])
  if ch.value_axis.has_major_gridlines:ch.value_axis.major_gridlines.format.line.color.rgb=rgb(GRID)
  if maxv:ch.value_axis.maximum_scale=maxv
  if kind in ['bar','stack']:
   ch.value_axis.visible=False;ch.plots[0].gap_width=65
   if kind=='bar':ch.plots[0].has_data_labels=True;ch.plots[0].data_labels.position=XL_LABEL_POSITION.OUTSIDE_END;ch.plots[0].data_labels.font.size=Pt(11);ch.plots[0].data_labels.font.color.rgb=rgb(WHITE);ch.plots[0].data_labels.number_format='#,##0'
 # Keep both the chart area and plot area dark / transparent in every renderer.
 sp=OxmlElement('c:spPr');sp.append(OxmlElement('a:noFill'));ln=OxmlElement('a:ln');ln.append(OxmlElement('a:noFill'));sp.append(ln);ch._chartSpace.append(sp)
 return sh

FONT='C:/Windows/Fonts/arial.ttf';BOLD='C:/Windows/Fonts/arialbd.ttf'
def fnt(size,b=False):return ImageFont.truetype(BOLD if b else FONT,size)
def gif(kind):
 path=OUT/f'{kind}.gif'
 if path.exists():return path
 frames=[];W,H=1100,650
 for k in range(44):
  t=k/43;step=min(3,k//10);im=Image.new('RGB',(W,H),'#'+PANEL);d=ImageDraw.Draw(im)
  def tx(v,x,y,size=27,c=WHITE,b=False):d.text((x,y),v,font=fnt(size,b),fill='#'+c)
  def rect(a,c=SOFT,rad=15):d.rounded_rectangle(a,radius=rad,fill='#'+c)
  def bar(x,y,w,h,portion,c):rect((x,y,x+w,y+h),GRID,h//2);rect((x,y,x+max(h,w*portion),y+h),c,h//2)
  def money(v):return f'{v:,.0f}'
  if kind=='cover':
   # No words on the cover artwork: a wallet, transfer path and tuition document.
   rect((70,170,390,440));d.rounded_rectangle((110,230,350,365),radius=20,outline='#'+TEAL,width=7);rect((278,270,365,322),TEAL);d.ellipse((298,287,311,300),fill='#'+BG)
   rect((720,110,1030,500));d.polygon([(780,225),(875,180),(970,225)],outline='#'+BLUE,width=5)
   for xx in [797,866,935]:d.line((xx,245,xx,330),fill='#'+BLUE,width=6)
   d.line((777,351,970,351),fill='#'+BLUE,width=6)
   for yy,ww in [(400,140),(432,105)]:rect((785,yy,785+ww,yy+10),GRID,5)
   d.line((390,302,720,302),fill='#'+GRID,width=5)
   xx=410+290*(t%1);d.ellipse((xx-18,284,xx+18,320),fill='#'+GOLD)
   for j in range(7):
    hh=(55+18*j)*min(1,t*2);xx=220+j*85;rect((xx,590-hh,xx+35,590),TEAL if j<5 else BLUE,6)
  elif kind=='struggles':
   tx('TWO MONTHS BEFORE TUITION',50,35,23,TEAL,True)
   stages=[('Rent is due','Living costs cannot stop.','2,125 CNY / month'),('Family sends from home','Funding starts in BDT.','BDT  ->  CNY'),('Tuition date gets closer','Balance is not readiness.','40,000 CNY due'),('A gap remains','Plan before the deadline.','6,750 CNY short')]
   a,b,c=stages[step];tx(a,55,124,48,WHITE,True);tx(b,55,205,29,MUTED);rect((55,295,1045,485));tx(c,92,343,53,RED if step==3 else TEAL,True)
   for i in range(4):rect((55+i*250,555,275+i*250,566),TEAL if i<=step else GRID,5)
  elif kind=='ai':
   tx('AI COPILOT / ILLUSTRATIVE RUN',44,30,22,TEAL,True)
   rect((45,95,1055,185));tx('Can I afford my next tuition bill?',70,122,31,WHITE,True)
   labels=['Read accounts and invoice','Calculate funding gap','Prepare a savings target','Wait for your confirmation']
   for i,label in enumerate(labels):
    yy=235+i*76;d.ellipse((57,yy+3,79,yy+25),fill='#'+(TEAL if i<step else GOLD if i==step else GRID));tx(label,100,yy,29,WHITE if i<=step else MUTED)
    if i==1 and step>=1:tx('6,750 CNY',820,yy,25,RED,True)
    if i==2 and step>=2:tx('3,375 / mo',820,yy,25,TEAL,True)
   if step>=3:rect((655,550,1055,615),TEAL);tx('REVIEW PLAN',736,565,25,BG,True)
  elif kind=='approval':
   tx('PARENT APPROVAL / ILLUSTRATIVE',44,28,22,TEAL,True)
   rect((45,92,1055,296));tx('Tuition support',75,119,32,WHITE,True);tx('CNY 6,750',75,183,52,WHITE,True);tx('Threshold: CNY 5,000',630,206,24,GOLD)
   labels=['Student confirms request','Parent reviews request','Parent explicitly approves','Request is queued']
   for i,label in enumerate(labels):
    yy=333+i*65;d.ellipse((57,yy+3,78,yy+24),fill='#'+(TEAL if i<step else GOLD if i==step else GRID));tx(label,99,yy,26,WHITE if i<=step else MUTED)
  elif kind=='settlement':
   tx('MANUAL SETTLEMENT / ILLUSTRATIVE',44,28,23,TEAL,True)
   names=['QUEUED','PROCESSING','COMPLETED']
   for i,name in enumerate(names):
    xx=40+i*355;rect((xx,105,xx+320,570));tx(name,xx+25,130,23,MUTED,True)
   col=min(2,step);xx=55+355*col
   rect((xx,228,xx+290,427),TEAL if col==2 else BLUE)
   tx('TUITION #024',xx+18,254,23,BG,True);tx('CNY 6,750',xx+18,302,36,BG,True);tx(['Review request','Record payout ref','Receipt recorded'][col],xx+18,366,20,BG)
   tx(['Moderator claims request','Moderator verifies settlement','Ledger and history updated','Sandbox flow complete'][step],55,593,24,TEAL)
  elif kind=='privacy':
   tx('FAMILY VISIBILITY / PERMISSION CHECK',44,28,23,TEAL,True)
   rect((45,105,530,565));rect((570,105,1055,565));tx('STUDENT VIEW',75,133,25,BLUE,True);tx('PARENT VIEW',600,133,25,TEAL,True)
   for i,(a,b) in enumerate([('Balance','CNY 27,500'),('Tuition due','CNY 40,000'),('Description','Personal purchase')]):
    yy=218+i*110;tx(a,75,yy,24,MUTED);tx(b,75,yy+36,29,WHITE,True);tx(a,600,yy,24,MUTED)
    if i<2:tx(b,600,yy+36,29,WHITE,True)
    else:
     rect((600,yy+38,995,yy+74),GRID,7);tx('Not shared',615,yy+42,23,MUTED)
   tx('Only permitted fields cross the family boundary.',55,598,24,TEAL)
   # Trace only allowed fields; private row stays masked throughout.
   yy=254+(k//11%2)*110;xx=530+40*(k%11)/10;d.ellipse((xx-7,yy-7,xx+7,yy+7),fill='#'+TEAL)
  elif kind=='team':
   tx('PRODUCT DELIVERY',55,40,24,TEAL,True)
   for i,(a,b) in enumerate([('AI + BACKEND','Tools / policies / data'),('FRONTEND + UX','Dashboards / workflows')]):
    xx=55+i*555;rect((xx,165,xx+435,430));tx(a,xx+28,208,31,WHITE,True);tx(b,xx+28,286,24,MUTED)
   d.line((490,300,610,300),fill='#'+GRID,width=6);xx=500+100*(k%22)/21;d.ellipse((xx-9,291,xx+9,309),fill='#'+TEAL)
   tx('One shared financial workspace',260,518,32,TEAL,True)
  frames.append(im.quantize(colors=100))
 frames[0].save(path,save_all=True,append_images=frames[1:],duration=150,loop=0,optimize=True,disposal=2)
 return path

def picture(s,p,x,y,w,h,order=2):
 sh=s.shapes.add_picture(str(p),Inches(x),Inches(y),Inches(w),Inches(h));sh.name=f'reveal_{order:02d}';return sh

def metric(s,label,value,x,y,w=2.2,c=TEAL,order=3):
 text(s,label,x,y,w,.25,11,MUTED);text(s,value,x,y+.38,w,.55,29,c,True,order)

def features(s,items,x=7.2,y=2.05,w=5.5):
 for i,(title,body) in enumerate(items):
  yy=y+i*.75;dot(s,x,yy+.06,.09,[TEAL,BLUE,GOLD][i%3]);text(s,title,x+.23,yy,w-.23,.28,15,WHITE,True,4+i);text(s,body,x+.23,yy+.32,w-.23,.46,12,MUTED,order=4+i)

def node(s,title,detail,x,y,w=2.1,c=TEAL,order=3):
 box(s,x,y,w,.88,SOFT,outline=GRID,name=f'reveal_{order:02d}');text(s,title,x+.12,y+.13,w-.24,.27,16,c,True,order,PP_ALIGN.CENTER);text(s,detail,x+.10,y+.51,w-.20,.22,10,MUTED,order=order,align=PP_ALIGN.CENTER)

# 1 — Only title and a single sentence. The diagram intentionally has no words.
s=new();text(s,'FinBridge AI',.65,2.10,6.2,1.0,48,WHITE,True,1);text(s,'An AI financial copilot helping students and families plan tuition, manage money and navigate cross-border funding.',.69,3.37,5.4,1.65,23,MUTED,order=2);picture(s,gif('cover'),6.38,1.50,6.55,3.87,3)
note(s,1,'Dark cover: wallet-to-university movement and growing funding bars. Only product name and one sentence appear as textual content.')

# 2 — The problem is visible in a funding waterfall and readiness chart.
s=new('A bank balance is not tuition readiness.','Problem statement','Living costs, future income and transfer fees all change what a student can actually afford.')
box(s,.55,2.10,8.0,4.62);text(s,'TUITION FUNDING BRIDGE',.80,2.32,7.5,.27,12,TEAL,True)
# Editable waterfall; consistent scale 40,000 CNY. Zero to 40k reference grid.
x0=.95;ybase=5.95;plotH=2.85;scale=plotH/40000
for val in [0,10000,20000,30000,40000]:
 yy=ybase-val*scale;line(s,1.50,yy,8.18,yy,GRID,.6);text(s,f'{val//1000}k',.85,yy-.10,.5,.20,10,MUTED)
water=[('Now',0,27500,BLUE),('+ Income',27500,37500,TEAL),('− Living',33250,37500,RED),('Projected',0,33250,BLUE),('Tuition',0,40000,GOLD)]
for i,(lab,lo,hi,c) in enumerate(water):
 x=1.68+i*1.29;box(s,x,ybase-hi*scale,.70,(hi-lo)*scale,c,r=.02,name=f'wipe_{3+i:02d}');text(s,f'{hi-lo:,.0f}',x-.22,ybase-hi*scale-.30,1.16,.25,12,c,True,3+i,PP_ALIGN.CENTER);text(s,lab,x-.26,6.13,1.25,.29,11,MUTED,align=PP_ALIGN.CENTER)
text(s,'CNY · two-month example · scholarship = 0',.84,6.47,7.3,.22,10,MUTED)
box(s,8.80,2.10,3.98,4.62);chart(s,'donut',9.10,2.53,3.36,2.80,['Funded','Shortfall'],[('Funding',[33250,6750])],[TEAL,RED],3)
text(s,'83%',9.88,3.50,1.8,.60,35,WHITE,True,align=PP_ALIGN.CENTER);text(s,'funded',10.07,4.13,1.4,.28,13,MUTED,align=PP_ALIGN.CENTER)
metric(s,'UNFUNDED TUITION','CNY 6,750',9.16,5.55,3.2,RED,6)
note(s,2,'Example is proportional to the tuition-gap unit test: available CNY 27,500 + two months of CNY 5,000 income - two months of CNY 2,125 living costs = CNY 33,250. Tuition CNY 40,000 leaves CNY 6,750 gap and CNY 3,375 per-month additional target. The readiness figure is 83.125%, displayed as 83%. Formula: src/lib/money.ts fundingGap; tests/finance.test.ts. No real-person outcome is claimed.')

# 3 — A dedicated real-world struggles slide, with a timeline and a real calculation.
s=new('Real-world struggles: one deadline, two countries.','Real-world struggles','Illustrative scenario: a Bangladeshi student in China must keep paying living costs while preparing tuition.')
box(s,.55,2.10,7.30,3.82);text(s,'FUNDING RUNWAY · CNY',.80,2.32,6.7,.27,12,TEAL,True)
chart(s,'line',.78,2.83,6.80,2.74,['Now','Month 1','Tuition due'],[('Projected funds',[27500,30375,33250]),('Tuition required',[40000,40000,40000])],[TEAL,GOLD],3,True,45000)
picture(s,gif('struggles'),8.08,2.10,4.70,2.78,4)
box(s,8.08,5.12,4.70,.80,SOFT);text(s,'Extra savings needed',8.29,5.28,2.3,.25,12,MUTED);text(s,'3,375 / mo',10.49,5.28,2.05,.35,20,TEAL,True,5)
for i,(a,b) in enumerate([('Rent continues','CNY 2,125 / month'),('Family funds in BDT','Compare total FX cost'),('Tuition approaches','Close the CNY 6,750 gap')]):
 x=.60+i*4.14;node(s,a,b,x,6.13,3.92,[BLUE,GOLD,RED][i],5+i)
note(s,None,'A real-world struggle scenario, explicitly illustrative rather than a documented case study. The chart uses the same inputs and exact formula as slide 2. Funding is CNY 27,500 initially, CNY 30,375 after one month and CNY 33,250 after two. The tuition line remains CNY 40,000. Student expenses, a parent funding from Bangladesh and a fixed tuition deadline motivate the app modules. No invented prevalence or survey statistics are used. Sources: README.md; src/lib/money.ts; src/services/tuition.service.ts; src/services/remittance.service.ts; src/actions/parent.actions.ts.')

# 4 — Our solution: compare real seeded provider formulas and connect the whole workflow.
s=new('See the gap. Compare the cost. Coordinate the funding.','Our solution','One workspace links tuition planning, cross-border comparison, parent approval and payment evidence.')
box(s,.55,2.10,7.30,4.02);text(s,'SEND BDT → RECEIVE CNY 6,750',.80,2.35,6.7,.30,14,TEAL,True)
text(s,'Extra sender cost vs lowest quote | BDT',.83,2.87,6.70,.30,12,MUTED)
chart(s,'bar',.72,3.23,6.93,2.39,[q[0] for q in quotes],[('Extra sender cost in BDT',[round(q[1]-quotes[0][1],2) for q in quotes])],[TEAL,BLUE,PURPLE,GOLD],3,maxv=3500)
text(s,'Extra cost vs lowest quote | sandbox seed rates | fees + spread included',.83,5.92,6.7,.26,10,MUTED)
box(s,8.08,2.10,4.70,4.02)
metric(s,'FUNDING GAP','CNY 6,750',8.38,2.40,3.9,RED,3)
metric(s,'LOWEST DEMO QUOTE',f'BDT {quotes[0][1]:,.0f}',8.38,3.62,3.9,TEAL,4)
metric(s,'QUOTE DIFFERENCE',f'BDT {quotes[-1][1]-quotes[0][1]:,.0f}',8.38,4.84,3.9,GOLD,5)
for i,(a,b) in enumerate([('Plan','Tuition + budget'),('Compare','Fees + FX'),('Approve','User + parent'),('Record','Receipt + ledger')]):
 x=.60+i*3.10;node(s,a,b,x,6.18,2.87,TEAL,4+i)
 if i<3:text(s,'→',x+2.88,6.41,.24,.31,18,TEAL)
note(s,3,'Provider comparison is computed with the actual repository formula, seeded provider fees and seeded rates CNY 5.21 / BDT 88.5. Target receipt is CNY 6,750. Principal = receipt / (targetRate/sourceRate * (1-spread)), rounded to cents; total = principal + principal*percentage_fee + fixed_fee. Providers and seed settings from scripts/generate-demo.mjs. These are sandbox seed values, not current market quotes. Bars show additional sender cost relative to the lowest demo quote; zero means no extra cost versus that baseline. Full exact values are in presentation/dark-assets/chart-data.json. Native workflow nodes show the product solution.')

# 5 — AI-focused implementation, concrete tool run and server architecture.
s=new('The AI turns financial questions into reviewed actions.','Our implementation / AI first','Application-owned tools ground the answer; confirmation and server checks control execution.')
picture(s,gif('ai'),.55,2.10,6.56,3.88,2)
box(s,7.36,2.10,5.42,3.88)
text(s,'APPLICATION TOOL GRAPH',7.61,2.35,4.9,.28,12,TEAL,True)
for i,(a,b) in enumerate([('getAccounts + getWorkspaceData','Balances, invoice and spending'),('calculateTuitionGap','CNY 6,750 gap → CNY 3,375 / month'),('requestAction → confirmAgentAction','Structured proposal → explicit review')]):
 yy=2.94+i*.86;dot(s,7.65,yy+.06,.14,[BLUE,TEAL,GOLD][i]);text(s,a,7.94,yy,4.52,.30,13.5,WHITE,True,3+i);text(s,b,7.94,yy+.37,4.52,.25,11,MUTED,order=3+i)
text(s,'Gemini  ·  OpenAI  ·  deterministic mock',7.64,5.61,4.86,.25,11,TEAL,True)
for i,(a,b) in enumerate([('React / Next.js','User workspace'),('AI + Zod','Validated tools'),('Server Actions','Auth / role / risk'),('MySQL ledger','Locks / idempotency')]):
 x=.60+i*3.10;node(s,a,b,x,6.13,2.87,[BLUE,PURPLE,GOLD,TEAL][i],4+i)
 if i<3:text(s,'→',x+2.89,6.37,.23,.32,17,TEAL)
note(s,4,'Combined implementation slide retains AI emphasis while making room for the real-world-struggles slide. The animated tool run is an illustrative reproduction of implemented tool and review behavior, not a recording of a live provider call. Exact tool names appear in src/ai/tools/index.ts and src/ai/action-catalog.ts. Confirmed non-financial proposals dispatch through src/actions/agent-workflow.actions.ts; money requests reuse src/services/payment.service.ts. Stack: Next.js/React/TypeScript, Zod, MySQL, Decimal.js. Chat can read authorized application context, compare providers, propose budgets and funding plans, draft payments, navigate and ask follow-ups. Financial execution requires confirmation. Tool logs and action state persist.')

# 6 — Student: real UI capture + native budget chart, complete compact role inventory.
s=new('Student features','Features / Student','Track everyday money, plan tuition and act with the AI copilot.')
box(s,.55,2.10,6.30,4.76);text(s,'BUDGET VS SPENDING · CNY',.80,2.32,5.8,.30,12,TEAL,True)
chart(s,'column',.76,2.87,5.85,2.15,['Housing','Food','Transport'],[('Budget',[1400,500,200]),('Spent',[1500,450,175])],[BLUE,TEAL],3,True,1800)
text(s,'Illustrative monthly budget: housing is CNY 100 over plan.',.82,5.10,5.7,.29,11,MUTED)
if (ROOT/'app-captures/shopping-card.png').exists():
 picture(s,ROOT/'app-captures/shopping-card.png',.82,5.61,2.95,1.29,4)
 text(s,'ACTUAL DEMO UI',4.02,5.70,2.50,.25,10,TEAL,True)
 text(s,'Category progress\nand overspend alerts',4.02,6.08,2.50,.60,14,WHITE,True)
features(s,[('Accounts & activity','Multi-currency wallets, cash, transactions, categories, search/filter, CSV mapping/import.'),('Tuition & planning','Invoices, scholarships, deadlines, savings scenarios, category budgets, credit guidance.'),('Payments & transfers','FX/providers, quotes, sends, top-ups, manual deposits, withdrawals, recipients and receipts.'),('AI copilot','Chat/tool history, advice, follow-ups, navigation, reviewed actions and model selection.'),('Family & notifications','Invitations, recipient/transfer approvals, reminders, alerts/snooze and ledger history.'),('Personal account','Plans/quotas/history, saved cards/models, profile/security, reports, export and closure.')],y=2.11)
text(s,'3 languages · themes · country/currency · time zone · search',7.43,6.78,5.13,.23,10,TEAL)
note(s,6,'The native chart is illustrative, using monthly expenses CNY 1,500 housing + 450 food + 175 transport = 2,125. The shopping card is an actual screenshot from the local demo, separate from the illustrative scenario; its amounts are not part of the story dataset. Shared account preferences include language, theme, country, currency, timezone and notification choices. Monthly/annual sandbox subscriptions, cancellation/history, CSV limits/preview/atomic rollback, photo/password settings, data export and closure remain implemented. All original capability detail is retained below.')

# 7 — Parent: numerical approval boundary + actual state progression.
s=new('Parent features','Features / Parent','Support the student with scoped visibility, clear approval rules and spending limits.')
box(s,.55,2.10,6.30,2.44);text(s,'TRANSFER REVIEW BOUNDARIES · CNY',.80,2.32,5.80,.28,12,TEAL,True)
chart(s,'bar',.78,2.79,5.80,1.42,['Approval threshold','Student request','Hard transfer cap'],[('CNY',[5000,6750,10000])],[GOLD,BLUE,TEAL],3,maxv=12000)
picture(s,gif('approval'),.55,4.77,6.30,2.10,4)
features(s,[('Family circle','Invite/link students, review linked finances and revoke relationships.'),('Visibility matrix','Balances, category totals, descriptions, tuition, budgets and permission-aware alerts.'),('Approval center','Approve/reject payments and beneficiaries; reasons/history; tuition/conversion sign-off.'),('Spending controls','Thresholds, transfer/daily/monthly caps, category limits, auto-approval and one-time recipients.'),('Parent money & AI','Own wallets, student funding, deposits/payments, transactions/CSV and reviewed AI actions.'),('Shared account tools','Plans, cards/models, alerts/reports, profile/security, preferences, export and closure.')],y=2.11)
text(s,'Parent policies can tighten platform limits.',7.43,6.78,5.13,.23,10,TEAL)
note(s,7,'Illustrative threshold CNY 5,000, request CNY 6,750 and per-transfer cap CNY 10,000. The request exceeds the approval threshold but stays below the hard cap, so it needs parent review rather than automatic rejection (other policy checks still apply). The animation is a state demonstration, not a real transfer. Parent authorization is explicit; the model cannot approve by itself. The strongest applicable parent policy wins, and parents cannot relax platform risk limits.')

# 8 — Admin: settlement progression and operational chart.
s=new('Admin features','Features / Admin & moderator','Configure the sandbox, resolve requests and inspect the evidence behind each financial action.')
picture(s,gif('settlement'),.55,2.10,6.30,2.65,2)
box(s,.55,4.96,6.30,1.92);text(s,'EXAMPLE QUEUE SNAPSHOT',.80,5.16,5.8,.26,11,TEAL,True)
chart(s,'column',.79,5.55,5.79,1.15,['Queued','Processing','Completed'],[('Requests',[6,2,12])],[GOLD,BLUE,TEAL],3,maxv=15)
features(s,[('Users & roles','User/role management, suspend/reactivate, metrics and delegated moderator scopes.'),('Manual settlement','Claim/process/complete/fail, payout references, held funds/refunds and receiving details.'),('Financial configuration','Risk/frequency ceilings, FX, providers/fees/spreads/routes and credit guidance.'),('Catalog & subscriptions','Countries/currencies, defaults/settings, pricing, quotas and feature limits.'),('AI & platform team','Shared models/keys, connection tests, run/tool inspection and published team profiles.'),('Reports & evidence','Resolve reports; audit logs, transfer receipts, project and security evidence exports.')],y=2.11)
text(s,'Moderator access is limited to assigned sections.',7.43,6.78,5.13,.23,10,TEAL)
note(s,8,'Queue counts 6, 2 and 12 are illustrative snapshot values, not production metrics. Animated card shows manual queue progression with a reference and receipt, with no actual transfer execution. Admin uses role-restricted settlement service, provider/catalog/risk/plan controls and evidence inspection. Moderator delegations and team publishing remain in the feature list. Source code and original detailed inventory follow.')

# 9 — Privacy as an actual visibility boundary, then security layers.
s=new('Security & privacy','Security & Privacy','Controls are applied to each action and each field of financial context.')
picture(s,gif('privacy'),.55,2.10,7.20,4.26,2)
security=[('IDENTITY','bcrypt hashes; signed sessions; revocation.'),('ACCESS','Role + ownership checks; parent permissions.'),('AI & SECRETS','AES-256-GCM model keys; validated tools.'),('MONEY INTEGRITY','Confirmation, locks, tokens, balanced ledger.')]
for i,(a,b) in enumerate(security):
 y=2.21+i*1.02;tag(s,f'0{i+1}',8.03,y,.45,[BLUE,TEAL,PURPLE,GOLD][i]);text(s,a,8.66,y,4.1,.30,14,WHITE,True,3+i);text(s,b,8.66,y+.43,4.0,.50,13,MUTED,order=3+i)
box(s,.55,6.57,12.23,.44,SOFT);text(s,'Data export  ·  Account closure  ·  No stored full PAN/CVV  ·  Selected AI context may reach the configured provider',.77,6.69,11.8,.23,11,MUTED)
note(s,9,'The animation demonstrates the existing permission matrix: a parent may see balances and tuition while transaction descriptions remain hidden. It does not imply a specific demo account has these permissions. Encrypted-key handling is for AI API keys, not a claim that all financial data is encrypted. User closure revokes access but is not an erasure promise. Fields sent through AI tools may reach the configured provider. Controls are implemented; no independent certification is claimed.')

# 10 — Two actual editable demo avatars, roles, and a delivery diagram.
s=new('The team behind FinBridge AI','Developer introduction')
for i in range(2):
 x=1.02+i*7.20
 picture(s,ROOT/f'demo-developer-{i+1}.png',x+.70,2.08,2.20,2.20,2+i)
 text(s,f'Developer {i+1}',x,4.58,3.60,.53,28,WHITE,True,4+i,PP_ALIGN.CENTER)
 text(s,'AI & Backend' if i==0 else 'Frontend & UX',x,5.28,3.60,.36,17,TEAL,order=4+i,align=PP_ALIGN.CENTER)
picture(s,gif('team'),4.98,3.02,3.33,1.97,5)
text(s,'Demo portraits, names and roles — replace with your team.',.72,6.54,11.9,.30,12,MUTED,align=PP_ALIGN.CENTER)
note(s,10,'Two editable circular demo portraits with placeholder names and suggested roles. The user requested demo details to replace manually. These are not verified repository contributor identities. Use Change Picture, and crop replacement photos to oval. The delivery diagram connects AI/backend work to frontend/UX work.')

for s in P.slides:
 tr=OxmlElement('p:transition');tr.set('spd','med');tr.set('advClick','1');tr.append(OxmlElement('p:fade'));s._element.append(tr)
P.save('presentation-deck.pptx')
print('Saved',len(P.slides),'dark slides. Native charts:',sum(1 for s in P.slides for q in s.shapes if q.has_chart));print('Provider totals:',quotes)
