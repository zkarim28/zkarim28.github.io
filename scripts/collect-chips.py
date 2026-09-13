#!/usr/bin/env python3
"""Rebuild the Zeptobars catalog. Requires: pip install beautifulsoup4.
Caches source HTML in /tmp/chips-source; run from the repository root.
"""
import subprocess, concurrent.futures, datetime, hashlib, json, pathlib, re, time, urllib.request
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
BASE = 'https://zeptobars.com'
CACHE = pathlib.Path('/tmp/chips-source'); CACHE.mkdir(exist_ok=True)
OUT = pathlib.Path('assets/chips'); OUT.mkdir(exist_ok=True)
def get(url):
    path = CACHE / (hashlib.sha256(url.encode()).hexdigest()+'.html')
    if path.exists(): return path.read_text()
    for attempt in range(4):
        try:
            data = subprocess.check_output(['curl', '-fLsS', '--max-time', '45', '--user-agent', 'ChipAtlas/1.0 (educational archive; attributed to Zeptobars)', url]).decode('utf-8', errors='replace')
            path.write_text(data); time.sleep(.2); return data
        except Exception:
            if attempt==3: raise
            time.sleep(2**attempt)
def soup(url): return BeautifulSoup(get(url),'html.parser')
def absolute(url): return urljoin(BASE,url.strip()).replace('http://','https://')
def archive(page):
    doc=soup(f'{BASE}/en/?p={page}')
    links=[absolute(a['href']) for a in doc.select('.bigpostnew h1 a')]
    if not links: raise ValueError(f'Empty archive page {page}')
    return links
def category(title):
    rules=[('Lab & microscopy',r'Behind the scene|Zeptolab|My new|How to|Etching|open.*microchip'),('Memory',r'\b(?:RAM|SRAM|DRAM|SDRAM|VRAM|ROM|EPROM|EEPROM|PROM)\b|memory|flash'),('Processors',r'CPU|processor|microcontroller|STM32|PIC\d|ATmega|MSP430|RISC|8051|Z80|ESP8266'),('Analog',r'opamp|op-amp|amplifier|analog|ADC|DAC|comparator|filter'),('Power',r'regulator|power|MOSFET|IGBT|rectifier|converter|motor driver|LDO'),('Logic',r'logic|TTL|CMOS|gate|counter|multiplexer|inverter|flip.flop'),('Interface & RF',r'USB|RF|radio|ethernet|transceiver|PLL|controller|Bluetooth')]
    return next((name for name,pattern in rules if re.search(pattern,title,re.I)), 'Other devices')
def article(item):
    url,page=item; doc=soup(url); post=doc.select_one('.bigpostnew'); heading=post.find('h1')
    title=heading.get_text(' ',strip=True); heading.decompose()
    for el in post.select('.social, script, style'): el.decompose()
    images=[]
    for img in post.find_all('img'):
        src=absolute(img.get('src',''))
        if not re.search(r'\.(jpg|jpeg|png|gif|webp)(\?|$)',src,re.I) or '/i/' in src or 'creativecommons' in src: continue
        parent=img.find_parent('a'); full=absolute(parent.get('href','')) if parent else src
        if not re.search(r'\.(jpg|jpeg|png|gif|webp)(\?|$)',full,re.I): full=src
        if src not in [i['src'] for i in images]: images.append({'src':src,'full':full,'alt':img.get('alt','').strip()})
    for br in post.find_all('br'): br.replace_with('\n')
    body=re.sub(r'[ \t]+',' ',post.get_text(' ',strip=True)); body=re.sub(r'\s*\n\s*','\n',body).strip()
    links=[{'label':a.get_text(' ',strip=True),'url':absolute(a['href'])} for a in post.select('a[href]') if a.get_text(strip=True) and not a.find('img') and absolute(a['href']).startswith('https://')]
    date=doc.select_one('.datpos').get_text(strip=True)
    try: published=datetime.datetime.strptime(date,'%B %d, %Y').date().isoformat()
    except ValueError: published=date
    # Store dated source passages as evidence, never infer release dates from post dates.
    evidence=[]
    for sentence in re.split(r'(?<=[.!?])\s+|\n', title + '\n' + body):
        years=[y for y in re.findall(r'\b(?:19|20)\d{2}\b',sentence) if int(y)<=datetime.date.today().year]
        if re.search(r'Amiga 2000|1000/2000|1970\'s|1960\'s', sentence): years=[]
        if years and len(sentence)<1000: evidence.append({'years':sorted(set(map(int,years))),'text':sentence})
    size=re.search(r'(?:die|chip|crystal) size[^.\n]{0,100}',body,re.I)
    return {'id':url.rsplit('/',1)[-1], 'title':re.sub(r'\s*:\s*weekend die-shot','',title,flags=re.I),'source':url,'archivePage':page,'published':published,'category':category(title),'links':links,'text':body,'images':images,'dieSize':size.group(0) if size else None,'yearEvidence':evidence,'chipYear':None,'yearStatus':'Not established'}
def main():
    first=soup(BASE+'/en/?p=1'); pages=max(int(m) for a in first.select('a[href]') for m in re.findall(r'\?p=(\d+)',a['href']))
    entries={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for page,links in zip(range(1,pages+1),pool.map(archive,range(1,pages+1))):
            for link in links: entries.setdefault(link,page)
    print(f'{pages} archive pages; {len(entries)} articles',flush=True)
    records=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for record in pool.map(article,entries.items()):
            records.append(record)
            if len(records)%25==0: print(f'Parsed {len(records)} articles',flush=True)
    references=json.loads((OUT/'year-references.json').read_text()) if (OUT/'year-references.json').exists() else {}
    for record in records: record.update(references.get(record['id'],{}))
    data={'source':BASE+'/en/','collected':datetime.date.today().isoformat(),'archivePages':pages,'license':'CC BY 3.0','licenseSource':BASE+'/en/about-us','records':records}
    (OUT/'catalog.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(f'Saved {len(records)} articles / {sum(len(r["images"]) for r in records)} images',flush=True)
if __name__=='__main__': main()
