import sys, math, json, re
from pathlib import Path
sys.path.insert(0,str(Path('.local/presentation-tools').resolve()))
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.chart.data import CategoryChartData
from pptx.oxml.xmlchemy import OxmlElement

OUT=Path('presentation'); OUT.mkdir(exist_ok=True)
BG='101E2B'; PANEL='192C3B'; WHITE='F3F7F6'; MUTED='A8BCC6'; TEAL='47DDC0'; GOLD='FFCE79'; BLUE='72A9FF'; RED='FF8D95'
R=Presentation();R.slide_width=Inches(13.333);R.slide_height=Inches(7.5)
R.core_properties.title='FinBridge AI | Project Presentation'
R.core_properties.subject='Cross-border and student finance assistant'
R.core_properties.author='FinBridge AI Project Team'
R.core_properties.keywords='student finance, AI copilot, parent controls, sandbox payments'
manifest=[]
def color(c):return RGBColor.from_string(c)
def rect(s,x,y,w,h,fill=PANEL,radius=True,line=None):
 sh=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h));sh.fill.solid();sh.fill.fore_color.rgb=color(fill);sh.line.fill.background()
 if line:sh.line.color.rgb=color(line)
 if radius:
  try:sh.adjustments[0]=.12
  except:pass
 return sh

def txt(s,text,x,y,w,h,size=18,c=WHITE,bold=False,align=None):
 sh=s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); tf=sh.text_frame;tf.word_wrap=True;tf.margin_left=0;tf.margin_right=0;tf.margin_top=0;tf.margin_bottom=0
 for i,line in enumerate(text.split('\n')):
  p=tf.paragraphs[0] if i==0 else tf.add_paragraph();p.text=line;p.font.name='Aptos';p.font.size=Pt(size);p.font.bold=bold;p.font.color.rgb=color(c);p.space_after=Pt(7)
  if align is not None:p.alignment=align
 return sh

def pill(s,t,x,y,w,c=TEAL):
 rect(s,x,y,w,.31,fill=c);txt(s,t,x+.08,y+.035,w-.16,.23,10,BG,True)

def ellipse(s,x,y,w,h,c):
 sh=s.shapes.add_shape(MSO_SHAPE.OVAL,Inches(x),Inches(y),Inches(w),Inches(h));sh.fill.solid();sh.fill.fore_color.rgb=color(c);sh.line.fill.background();return sh

def animated_signal(n):
 path=OUT/f'signal-{n:02d}.gif'; frames=[]
 for k in range(28):
  im=Image.new('RGB',(640,260),'#'+BG);d=ImageDraw.Draw(im)
  for j in range(9):
   x=22+j*68;h=int(38+(j*13)+(22*math.sin(k/28*math.tau+j*.65)));d.rounded_rectangle((x,235-h,x+38,235),radius=10,fill='#'+(TEAL if j%3 else BLUE))
  pts=[(30+j*68,155-j*11+int(10*math.sin(k/28*math.tau+j*.4))) for j in range(9)]
  d.line(pts,fill='#'+GOLD,width=5);pos=k%9;cx,cy=pts[pos];d.ellipse((cx-8,cy-8,cx+8,cy+8),fill='#'+WHITE)
  frames.append(im)
 frames[0].save(path,save_all=True,append_images=frames[1:],duration=65,loop=0)
 return path

def animate(s,shape):
 # Native PowerPoint fade entrance, automatically triggered with the slide.
 pid=shape.shape_id
 xml=f'''<p:timing xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="4" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="withEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="5" dur="650"/><p:tgtEl><p:spTgt spid="{pid}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>'''
 from lxml import etree
 s._element.append(etree.fromstring(xml))

def slide(title=None,kicker=None,subtitle=None):
 s=R.slides.add_slide(R.slide_layouts[6]);s.background.fill.solid();s.background.fill.fore_color.rgb=color(BG);n=len(R.slides)
 if title:
  txt(s,kicker.upper(),.55,.30,11,.25,10,TEAL,True)
  txt(s,title,.55,.78,12.1,.65,32,WHITE,True)
  if subtitle:txt(s,subtitle,.58,1.49,11.95,.55,14,MUTED)
  rect(s,.55,7.04,12.2,.012,TEAL,False)
  txt(s,'FINBRIDGE AI  /  PROJECT PRESENTATION',.58,7.16,10,.20,9,MUTED)
  txt(s,f'{n:02d} / 10',11.70,7.12,1,.25,10,MUTED,align=PP_ALIGN.RIGHT)
  s.shapes.add_picture(str(animated_signal(n)), Inches(11.50), Inches(.12), Inches(1.25), Inches(.51))
 return s

def notes(s,body,sources):
 s.notes_slide.notes_text_frame.text=body+'\n\nRepository evidence: '+sources+'\nAnimation: automatic native fade entrance, fade slide transition and looping animated signal graphic. Play in PowerPoint Slide Show. Charts with example amounts are illustrative, not measured outcomes.'
 manifest.append({'slide':len(R.slides),'title':s.shapes[1].text if len(R.slides)>1 else 'FinBridge AI','sources':sources})

def cards(s,items,top=2.12,height=1.88):
 for i,(title,body) in enumerate(items):
  col=i%3;row=i//3;x=.58+col*4.12;y=top+row*(height+.22)
  rect(s,x,y,3.94,height)
  pill(s,f'{i+1:02d}',x+.18,y+.17,.42)
  txt(s,title,x+.78,y+.15,2.96,.36,17,WHITE,True)
  txt(s,body,x+.20,y+.68,3.55,height-.72,13.5,MUTED)

def flow(s,labels,y=5.7):
 w=(12.15-(len(labels)-1)*.23)/len(labels)
 for i,(a,b) in enumerate(labels):
  x=.60+i*(w+.23);rect(s,x,y,w,.79,TEAL if i==len(labels)-1 else PANEL)
  txt(s,a,x+.10,y+.12,w-.20,.24,12,BG if i==len(labels)-1 else WHITE,True,PP_ALIGN.CENTER)
  txt(s,b,x+.08,y+.42,w-.16,.22,10,BG if i==len(labels)-1 else MUTED,False,PP_ALIGN.CENTER)
  if i<len(labels)-1:txt(s,'›',x+w+.03,y+.20,.18,.35,21,TEAL)

def bar(s,x,y,w,h,cats,vals,series='Illustrative amount',chart_type=XL_CHART_TYPE.BAR_CLUSTERED,accent=TEAL):
 data=CategoryChartData();data.categories=cats;data.add_series(series,vals)
 chart=s.shapes.add_chart(chart_type,Inches(x),Inches(y),Inches(w),Inches(h),data).chart
 chart.has_legend=False;chart.chart_style=10
 chart.font.name='Aptos';chart.font.size=Pt(11);chart.font.color.rgb=color(MUTED)
 chart.chart_format if hasattr(chart,'chart_format') else None
 for ser in chart.series:
  ser.format.fill.solid();ser.format.fill.fore_color.rgb=color(accent);ser.format.line.fill.background()
 try:
  chart.category_axis.tick_labels.font.size=Pt(11);chart.category_axis.tick_labels.font.color.rgb=color(MUTED)
  chart.value_axis.tick_labels.font.size=Pt(10);chart.value_axis.tick_labels.font.color.rgb=color(MUTED)
  chart.value_axis.has_major_gridlines=False
 except:pass
 return s.shapes[-1]

# 01: precisely two text elements: product title and one-sentence description.
s=slide();txt(s,'FinBridge AI',.74,1.80,11.8,1,58,WHITE,True)
txt(s,'An AI financial copilot connecting international students and families through smarter planning and safer cross-border finance.',.80,3.04,11.5,1.05,25,MUTED)
pic=s.shapes.add_picture(str(animated_signal(1)),Inches(7.4), Inches(4.50), Inches(4.8), Inches(1.95));animate(s,pic)
# purely graphical bridge mark
for x in [1.02,2.02,3.02]:rect(s,x,5.10,.10,1.20,TEAL,False)
rect(s,.90,5.40,2.50,.10,TEAL,False)
notes(s,'Introduce FinBridge AI as a student and family finance project. It combines planning, simulated remittances and a tool-based AI copilot. All payment flows are sandbox simulations; no real money is moved.','README.md; public/brand/mark.svg')

# 02
s=slide('Studying abroad makes money hard to coordinate.','01 / Problem statement','Different currencies, payment deadlines and family expectations create one connected planning problem.')
for i,(t,b) in enumerate([
 ('Fragmented money','Balances and expenses are spread across accounts and currencies.'),
 ('Uncertain tuition readiness','An account balance alone ignores scholarships, future income and living costs.'),
 ('Opaque transfer costs','Fixed fees, percentage fees and FX spreads complicate comparisons.'),
 ('Family coordination gaps','Students need independence; parents need permission-based visibility and approvals.')]):
 x=.60+(i%2)*6.15;y=2.15+(i//2)*1.31;rect(s,x,y,5.95,1.12);txt(s,t,x+.18,y+.14,5.55,.30,18,WHITE,True);txt(s,b,x+.18,y+.53,5.55,.52,14,MUTED)
flow(s,[('HOME FUNDING','Multiple currencies'),('STUDENT WALLET','Living costs'),('UNIVERSITY','Tuition deadline')],5.40)
txt(s,'Design problem illustrated above; no external survey or market statistics are claimed.',.62,6.48,11,.25,11,MUTED)
animate(s,s.shapes[5]);notes(s,'Frame the problem using the workflows implemented in this repository rather than unsourced market statistics. The project targets international students, parents and educational sponsors.','README.md; src/services/tuition.service.ts; src/services/remittance.service.ts; src/services/parent-controls.service.ts')

# 03
s=slide('One workspace. A shared financial picture.','02 / Our solution','FinBridge links student planning, family governance and operational oversight around an AI copilot.')
for i,(title,body,c) in enumerate([
 ('STUDENT','Plan tuition, track spending, compare transfer costs and act with AI.',TEAL),
 ('AI COPILOT','Read verified data, explain options and prepare actions for review.',BLUE),
 ('PARENT + ADMIN','Apply family limits, approve requests and settle sandbox payments.',GOLD)]):
 x=.6+i*4.12;rect(s,x,2.15,3.93,2.10);pill(s,title,x+.2,2.37,3.50,c);txt(s,body,x+.22,2.98,3.49,.95,20,WHITE)
flow(s,[('CONNECT','Wallets + transactions'),('PLAN','Budgets + tuition'),('REVIEW','User + parent rules'),('RECORD','Receipts + audit')],4.90)
txt(s,'Shared across the experience: English / Bengali / Chinese • persistent themes • global search • profile and country preferences',.63,6.20,12,.52,14,MUTED)
animate(s,s.shapes[8]);notes(s,'The same payment backend is reused by student, parent and AI workflows. Shared experience includes onboarding, preferred currency, language, time zone, notifications, theme, search, subscriptions, saved demo cards and personal model settings. The platform is a sandbox with manual external settlement.','src/actions/dashboard.actions.ts; src/components/layout/shell.tsx; src/actions/preferences.actions.ts; src/services/payment.service.ts; IMPLEMENTATION_STATUS.md')

# 04 AI centerpiece
s=slide('The AI understands the task—and prepares the next step.','03 / Our implementation · AI first','Tool-based assistance grounded in application data, with visible progress and structured follow-up questions.')
rect(s,.60,2.08,5.14,3.95)
pill(s,'EXAMPLE CONVERSATION',.82,2.30,2.62,BLUE)
txt(s,'“Can I afford next semester?”',.84,2.88,4.65,.70,24,WHITE,True)
for i,(a,b) in enumerate([('READ','Accounts, transactions and tuition invoice'),('CALCULATE','Funding gap, living costs and readiness'),('PROPOSE','A savings plan or payment draft to review')]):
 pill(s,a,.85,3.83+i*.61,1.22);txt(s,b,2.25,3.84+i*.61,3.18,.51,13,MUTED)
txt(s,'Illustrative tuition plan · CNY',6.03,2.17,6.4,.35,17,WHITE,True)
ch=bar(s,5.95,2.71,6.67,2.75,['Tuition due','Funds + scholarship','Projected gap'],[42000,30000,12000],series='Illustrative CNY',accent=BLUE)
pill(s,'PROVIDER CHOICE',6.14,5.56,2.03);txt(s,'Gemini  /  OpenAI  /  deterministic local mock',8.36,5.60,4.02,.52,14,WHITE)
txt(s,'Also: budget suggestions • FX comparisons • financial health • credit guidance • navigation • payment drafts',.64,6.32,12,.50,14,MUTED)
animate(s,ch);notes(s,'Primary AI capabilities: getStudentProfile, getAccounts, analyseTransactions, calculateTuitionGap, compareRemittance, getFxRates, generateBudgetSuggestion, analyseFinancialHealth, getCreditGuidance, getWorkspaceData, assessPaymentRisk, draftPayment, beneficiary tools, requestAction and respond. The role-checked catalog also supports account, transaction, budget, tuition, alert, credit, family, preference, report and subscription tasks. Financial execution requires explicit UI confirmation. Some approved low-impact tools may create drafts, beneficiaries or alerts; do not claim the model is universally read-only. The chart is a deliberately simplified illustrative plan, not a live account or measured result.','src/ai/tools/index.ts; src/ai/action-catalog.ts; src/ai/mock-provider.ts; src/ai/gemini-provider.ts; src/ai/openai-provider.ts')

# 05 Architecture
s=slide('From language to a validated, auditable action.','04 / Our implementation · Architecture','The model selects application tools; authenticated server code controls permissions and money movement.')
flow(s,[('PROMPT','Student or parent'),('AI PROVIDER','Tools + schemas'),('ACTION REVIEW','Explicit confirmation'),('SERVER ACTION','Auth + role + policy'),('MYSQL LEDGER','Atomic commit')],2.22)
for i,(a,b) in enumerate([
 ('APPLICATION','Next.js 16 + React 19\nTypeScript, Tailwind, MUI\nCharts + React Flow'),
 ('AI ORCHESTRATION','Zod tool schemas\nStructured action catalog\nPersistent runs + tool logs'),
 ('FINANCIAL CORE','Decimal.js precision\nRow locks + idempotency\n57 relational tables')]):
 x=.61+i*4.13;rect(s,x,3.42,3.92,1.78);txt(s,a,x+.20,3.64,3.50,.31,16,TEAL,True);txt(s,b,x+.20,4.12,3.50,.97,16,WHITE)
rect(s,.62,5.55,12.10,.84);txt(s,'PAYMENT LIFECYCLE',.84,5.76,2.20,.30,12,TEAL,True);txt(s,'Draft → Parent review if needed → Queue → Processing → Completed / Failed / Cancelled',3.08,5.73,9.35,.47,15,WHITE)
txt(s,'External channels use manual settlement. Failed or cancelled eligible requests release held funds or refund through the shared service.',.64,6.52,12,.30,11,MUTED)
animate(s,s.shapes[5]);notes(s,'Server Actions perform authentication, role and ownership checks, strict validation, risk checks and parent controls. Financial mutations reuse payment.service.ts; non-financial confirmations dispatch to existing server actions. Model instructions treat user and tool text as untrusted and prohibit invented balances, IDs and successful results. Secure-input tasks open standard forms. The database schema contains 57 CREATE TABLE definitions. Stack versions reflect package.json. Testing exists at unit, provider-contract, database integration and Playwright levels; this deck does not assert a fresh test run or a security certification.','package.json; database/schema.sql; src/actions/agent-workflow.actions.ts; src/ai/action-service.ts; src/ai/structured-response.ts; src/services/payment.service.ts; tests/')

# 06 Student features
s=slide('Features for students','05 / Features · Student','A complete journey from everyday spending to semester funding and reviewed AI-assisted actions.')
cards(s,[
 ('Money + transactions','Multi-currency accounts; cash records; expenses/income; categories; search/filter; CSV mapping, preview and atomic import.'),
 ('Planning + readiness','Category budgets; spending charts; tuition invoices, scholarships, deadlines, savings targets and funding scenarios; credit checklist.'),
 ('Transfers + payments','Provider / fee / FX comparison; locked quotes; internal sends, card top-ups, manual deposits, withdrawals; saved beneficiaries and receipts.'),
 ('AI financial copilot','Model selection; chat history and tool progress; funding and budget advice; follow-up questions; navigation and confirmed actions.'),
 ('Family + awareness','Accept family invitations; parent-governed recipients and transfers; automatic alerts, reminders, snooze/dismiss; activity and ledger history.'),
 ('Account + personalization','Plans, quotas, demo checkout and history; saved cards; model keys; profile/security; languages, themes, search; reports, export and closure.')],height=1.98)
# Mini budget graphic, above footer, is illustrative and uses native shapes.
for i,(label,v,c) in enumerate([('Housing',.65,TEAL),('Food',.4,BLUE),('Savings',.25,GOLD)]):
 x=.66+i*4.12;txt(s,label,x,6.57,1.0,.22,10,MUTED);rect(s,x+1.0,6.62,2.3,.08,PANEL,False);rect(s,x+1,6.62,2.3*v,.08,c,False)
txt(s,'Illustrative budget bars',10.22,6.78,2.45,.15,8,MUTED)
animate(s,s.shapes[5]);notes(s,'Student feature inventory: account creation/rename/archive; separate cash and payment wallet semantics; manual categorized transactions and confidence display; pagination/filtering; CSV file and row limits, mapping and preview; budget creation/edit, mixed-currency normalization and AI suggestions; tuition paid and scholarship tracking, monthly funding plans and readiness; educational credit profile and country-specific checklist; FX charts/provider comparisons, locked quotes and reviewed legacy sandbox execution; unified internal/card/manual/external payment requests and beneficiary approvals; saved card management; payment statuses, cancellation, receipts, ledger and audit activity; AI providers, personal keys, selection and tests; family invitation acceptance; automatic alerts and user reminders; subscription quotas, monthly/annual sandbox checkout, change history and cancellation; support reports; profile photo/name/email, password reset/change, locale/country/currency/time zone/theme/notifications; data export and account closure. The mini bars are illustrative visual cues.','src/actions/; src/components/accounts/; src/components/tuition/; src/components/budget/; src/components/payments/; src/components/layout/utility-pages.tsx; src/components/settings/platform-panels.tsx')

# 07 Parent
s=slide('Features for parents','06 / Features · Parent','Fund a student with clear visibility and configurable guardrails that preserve financial independence.')
cards(s,[
 ('Family circle','Invite registered students; manage linked relationships; revoke access; review linked-student finances.'),
 ('Granular visibility','Choose access to balances, category totals, transaction descriptions, tuition and budgets; permission-aware alerts.'),
 ('Approval center','Approve/reject payment and transfer requests with reasons; approve student beneficiaries; tuition and conversion sign-off.'),
 ('Spending controls','Thresholds; per-transfer, daily and monthly caps; category limits; auto-approval and one-time recipient rules.'),
 ('Parent money + AI','Independent wallets; parent-to-student transfers; deposits and payment history; beneficiaries; AI assistance with reviewed decisions.'),
 ('Shared account tools','Transactions and CSV; subscriptions, saved cards and models; reports, alerts, preferences, security, data export and closure.')],height=1.98)
flow_labels=[('Platform ceiling',.98,BLUE),('Parent limit',.70,TEAL),('Allowed spending',.51,GOLD)]
for i,(lab,v,c) in enumerate(flow_labels):
 x=.65+i*4.13;txt(s,lab,x,6.57,1.48,.22,10,MUTED);rect(s,x+1.5,6.62,2.05,.08,PANEL,False);rect(s,x+1.5,6.62,2.05*v,.08,c,False)
animate(s,s.shapes[5]);notes(s,'Parent functions include linking and revocation, configurable visibility, parent-owned financial accounts and wallet transfers, transaction recording and CSV imports under role ownership, approval decisions and history, beneficiary decisions, controls for tuition/conversion, caps and thresholds, non-beneficiary policy and category limits. Strictest applicable parent policy wins and can only tighten administrator ceilings. Parent AI actions are restricted by the role catalog; the model does not approve by itself. Parent access to automatic alerts respects visibility. Parent subscriptions, cards, models and preferences share the customer workflow. Illustrative bars show nested policy constraints, not measured amounts.','src/actions/parent.actions.ts; src/services/parent-controls.service.ts; src/services/payment.service.ts; src/ai/action-catalog.ts; src/components/family/family-page.tsx; src/services/automatic-alerts.service.ts')

# 08 Admin
s=slide('Features for admins and delegated moderators','07 / Features · Admin','Operate the sandbox, configure financial policies and inspect the evidence behind each action.')
cards(s,[
 ('Users + oversight','User and role management; suspend/reactivate; dashboard metrics; delegated moderator sections; account and plan oversight.'),
 ('Settlement operations','Manual payment queue; claim/process/complete/fail requests; payout references; held funds/refunds; receiving details and channel settings.'),
 ('Financial configuration','Global risk ceilings; frequency and review thresholds; FX rates; providers, fees, spreads and currency corridors; credit guidance.'),
 ('Catalog + subscriptions','Country and currency editors; system settings/defaults; plan pricing, quotas and feature limits.'),
 ('AI + platform team','Shared provider/model setup; encrypted keys and connection tests; AI run/tool inspection; published team profiles and moderator permissions.'),
 ('Reports + evidence','Support/compliance report resolution; audit logs; transfer records and receipts; project evidence and security assessment exports.')],height=1.98)
for i,(a,b,c) in enumerate([('QUEUE','Review',BLUE),('PROCESSING','Handle',GOLD),('COMPLETED','Record',TEAL)]):
 x=.66+4.13*i;pill(s,a,x,6.52,1.8,c);txt(s,b,x+1.98,6.56,1.6,.22,11,MUTED)
animate(s,s.shapes[5]);notes(s,'Administrator features verified against admin.actions.ts, platform.actions.ts, payment.actions.ts, admin-page.tsx and financial-config.tsx. Moderator delegations cover reports, team, agent, models, users, finance and catalog; access is individually checked. Team editing includes publishing, designation and CEO designation, profile photo and limited moderator self-edit. Settlement actions are role restricted. Financial controls include risk caps, provider and route settings and country-specific credit education. Reporting and evidence are application artifacts, not independent compliance certification.','src/actions/admin.actions.ts; src/actions/platform.actions.ts; src/actions/payment.actions.ts; src/components/admin/; src/lib/admin-permissions.ts; src/components/layout/evidence-page.tsx')

# 09 Security
s=slide('Security & privacy are enforced at the action boundary.','08 / Security & Privacy','Each sensitive operation combines identity, permission, policy and financial-integrity checks.')
# layered vertical visual
for i,(a,b,c) in enumerate([
 ('01  IDENTITY','bcrypt password hashes • signed 8-hour JWT • httpOnly / SameSite cookies • session revocation',BLUE),
 ('02  AUTHORIZATION','Server-side role + ownership checks • delegated admin sections • parent visibility and strictest limits',TEAL),
 ('03  DATA + AI','AES-256-GCM model-key encryption • Zod validation • standard forms for credentials • constrained AI tools',GOLD),
 ('04  MONEY INTEGRITY','Explicit payment confirmation • expiring single-use transfer tokens • row locks • idempotency • balanced ledger',TEAL)]):
 y=2.14+i*.85;rect(s,.62,y,12.10,.70);pill(s,a,.80,y+.18,2.21,c);txt(s,b,3.24,y+.19,9.17,.42,13.5,WHITE)
rect(s,.64,5.82,5.92,.73);txt(s,'USER CONTROL',.84,5.95,1.70,.28,12,TEAL,True);txt(s,'Visibility settings, data export, account closure',2.65,5.98,3.65,.45,12,WHITE)
rect(s,6.76,5.82,5.94,.73);txt(s,'DATA BOUNDARY',6.95,5.95,1.72,.28,12,GOLD,True);txt(s,'No stored full PAN/CVV; validated photo uploads',8.80,5.98,3.65,.45,12,WHITE)
txt(s,'Sandbox only. Provider tools may receive financial context. Independent security/privacy certification and live payment-network integration are outside this project.',.65,6.69,12,.24,10,MUTED)
animate(s,s.shapes[5]);notes(s,'Security claims are code-level controls, not a certification. session.ts uses HS256, 8-hour JWT expiry, httpOnly, SameSite lax and production secure cookies; auth.ts verifies session_version. Passwords use bcrypt. secrets.ts encrypts AI keys using AES-256-GCM. Parent permissions govern disclosure. Avatar validation in current src/lib/avatar.ts accepts PNG/JPEG/WebP data URLs, checks signatures and enforces 300,000 bytes; README describes a different limit, so the slide deliberately makes no size claim. Profile export is capped per table and is not an exhaustive privacy portability certification. Account closure changes status and revokes sessions/links; it is not an erasure promise. AI adapters send selected conversational/tool context to the configured provider. No claim is made that all financial data is encrypted at rest. Legacy sandbox transfer uses locked quotes and single-use execution tokens. Unified payment path uses idempotency, transactional locking and policy checks. No fresh audit was run for this deck.','src/lib/session.ts; src/lib/auth.ts; src/lib/secrets.ts; src/lib/avatar.ts; src/lib/permissions.ts; src/lib/risk-engine.ts; src/actions/user.actions.ts; src/services/sandbox-payment.service.ts; src/services/payment.service.ts; src/ai/')

# 10 Team round demo portraits editable names + roles
s=slide('Built by a two-person team','09 / Developer introduction','Demo profiles below are editable placeholders—replace each portrait, name and role before presenting.')
def portrait(path,variant):
 im=Image.new('RGBA',(600,600),(0,0,0,0));d=ImageDraw.Draw(im);d.ellipse((0,0,599,599),fill='#'+(TEAL if variant==1 else BLUE));d.ellipse((110,346,490,740),fill='#20394A');d.ellipse((192,132,408,378),fill='#E9BC9A');d.ellipse((183,101,419,278),fill='#263044');d.rounded_rectangle((200,206,400,353),radius=68,fill='#E9BC9A');d.ellipse((239,248,251,260),fill='#263044');d.ellipse((346,248,358,260),fill='#263044');d.arc((267,280,333,314),0,180,fill='#AD6D5A',width=5)
 if variant==2:d.rounded_rectangle((216,233,281,280),radius=12,outline='#263044',width=7);d.rounded_rectangle((318,233,383,280),radius=12,outline='#263044',width=7);d.line((281,251,318,251),fill='#263044',width=6)
 im.save(path)
for i in range(2):
 x=1.25+i*6.25;rect(s,x,2.12,4.56,3.98);p=OUT/f'demo-developer-{i+1}.png';portrait(p,i+1);s.shapes.add_picture(str(p),Inches(x+1.36),Inches(2.42),Inches(1.84),Inches(1.84))
 txt(s,f'Developer {i+1}',x+.30,4.48,3.96,.48,25,WHITE,True,PP_ALIGN.CENTER)
 txt(s,'Demo role: AI & Backend' if i==0 else 'Demo role: Frontend & UX',x+.30,5.11,3.96,.36,17,TEAL if i==0 else BLUE,False,PP_ALIGN.CENTER)
 txt(s,'Name / photo / role to be replaced',x+.30,5.64,3.96,.25,11,MUTED,False,PP_ALIGN.CENTER)
# Two-person collaboration diagram
flow(s,[('AI + BACKEND','Tools, policies, data'),('FINBRIDGE AI','A shared product'),('FRONTEND + UX','Workflows, visuals')],6.20)
animate(s,s.shapes[5]);notes(s,'These are demo avatars and suggested role placeholders, explicitly requested by the user. They do not identify actual repository contributors and must not be presented as verified authorship. To replace a portrait, select the circular picture and use Change Picture. The PNG contains a circular portrait with transparent corners; apply Crop to Shape > Oval to any replacement photo. All name and role fields are normal editable PowerPoint text boxes.','User instruction: keep developer details demo for manual replacement; README.md project identity')

# Add native fade transitions to each slide before animation elements.
for s in R.slides:
 tr=OxmlElement('p:transition');tr.set('spd','med');tr.set('advClick','1');tr.append(OxmlElement('p:fade'))
 timing=s._element.find('{http://schemas.openxmlformats.org/presentationml/2006/main}timing')
 if timing is not None: timing.addprevious(tr)
 else:s._element.append(tr)
R.save('presentation-deck.pptx')
(OUT/'slide-evidence.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'PRESENTATION-NOTES.md').write_text('''# FinBridge AI presentation\n\nDeliverable: `../presentation-deck.pptx` (10 slides, 16:9).\n\nUse PowerPoint Slide Show to see the looping animated visuals, native fade entrances and slide transitions. Static previews and some browser viewers may not play animation. All charts are editable; illustrative examples are labeled and are not measured product outcomes. Slide 1 deliberately contains only the product title and a one-sentence description, plus decorative visuals.\n\nSlide 10 uses two demo portraits with editable developer-name and role placeholders, as requested. Replace images via Change Picture and crop replacements to an oval.\n\nSlide order: introduction; problem; solution; AI implementation; execution architecture; student features; parent features; admin features; security/privacy; developer introduction.\n\nPresenter notes include repository evidence and important implementation boundaries. The product is a sandbox, not a live money-transfer integration. `repository-inventory.json` lists the 130 reviewed project files; dependency trees, generated builds, environment secrets and the unrelated Microsoft cache are excluded. The generation script preserves all presentation content and can rebuild the deck using python-pptx and Pillow from `.presentation-tools`.\n''',encoding='utf-8')
print('Saved presentation-deck.pptx:',Path('presentation-deck.pptx').stat().st_size,'bytes;',len(R.slides),'slides')
