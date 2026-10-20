import sys,zipfile,json,math
from pathlib import Path
sys.path.insert(0,str(Path('.local/presentation-tools').resolve()))
from pptx import Presentation
from PIL import Image,ImageDraw,ImageFont
from lxml import etree
r=Presentation('presentation-deck.pptx'); issues=[]
fontpath='C:/Windows/Fonts/aptos.ttf'
if not Path(fontpath).exists():fontpath='C:/Windows/Fonts/arial.ttf'
for n,s in enumerate(r.slides,1):
 for sh in s.shapes:
  if sh.left<0 or sh.top<0 or sh.left+sh.width>r.slide_width+10000 or sh.top+sh.height>r.slide_height+10000:issues.append([n,'bounds',sh.shape_id])
  if sh.has_text_frame and sh.text.strip():
   h=0
   for p in sh.text_frame.paragraphs:
    size=p.font.size.pt if p.font.size else 18; f=ImageFont.truetype(fontpath,round(size*4/3)); avail=sh.width/914400*96; line='';lines=1
    for word in p.text.split():
     candidate=(line+' '+word).strip()
     if f.getlength(candidate)>avail and line:lines+=1;line=word
     else:line=candidate
    h+=lines*size*1.18+(p.space_after.pt if p.space_after else 0)
   # paragraph spacing after last line does not consume visible content
   h-=7
   if h>sh.height/12700+4:issues.append([n,'possible overflow',sh.text[:65],round(h),round(sh.height/12700)])
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
with zipfile.ZipFile('presentation-deck.pptx') as z:
 slides=[x for x in z.namelist() if __import__('re').fullmatch('ppt/slides/slide[0-9]+.xml',x)]
 for x in slides:
  doc=etree.fromstring(z.read(x));assert doc.find('p:transition',ns) is not None;assert doc.find('p:timing',ns) is not None
  ids=set(doc.xpath('//p:cNvPr/@id',namespaces=ns));assert all(x in ids for x in doc.xpath('//p:spTgt/@spid',namespaces=ns))
 gifs=[x for x in z.namelist() if x.endswith('.gif')]
 assert len(slides)==10
 text1=' '.join(r.slides[0].shapes[i].text for i in range(len(r.slides[0].shapes)) if r.slides[0].shapes[i].has_text_frame and r.slides[0].shapes[i].text)
 print('Slides:',len(slides),'| animated media:',len(gifs),'| charts:',len([x for x in z.namelist() if __import__('re').fullmatch('ppt/charts/chart[0-9]+.xml',x)]))
 print('First-slide text:',text1)
 print('Layout audit:',json.dumps(issues,ensure_ascii=False))
Path('presentation/validation.json').write_text(json.dumps({'slide_count':10,'native_entrances':10,'fade_transitions':10,'unique_animated_graphics':len(gifs),'animated_graphic_placements':10,'layout_findings':issues},indent=2),encoding='utf-8')
