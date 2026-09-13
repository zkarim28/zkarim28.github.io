'use strict';
const $ = id => document.getElementById(id);
const state = {records: [], filtered: [], category: 'All devices', limit: 24, images: [], imageIndex: 0, activeTitle: ''};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : '#'; } catch { return '#'; } };
const imageMarkup = (img, title, extra = '') => `<img src="${escapeHTML(safeURL(img.src))}" alt="${escapeHTML(img.alt || title)}" loading="lazy" decoding="async" ${extra}>`;
function card(record) {
  const element = document.createElement('details');
  element.className = 'card'; element.id = record.id;
  element.innerHTML = `<summary><div class="thumb">${record.images.length ? imageMarkup(record.images[0], record.title) : '<span>No image available</span>'}<span class="image-count">▧ ${record.images.length} VIEWS</span></div><div class="card-info"><div class="card-label"><span>${escapeHTML(record.category)}</span><time datetime="${escapeHTML(record.published)}">POST / ${escapeHTML(record.published.slice(0,4))}</time></div><h3>${escapeHTML(record.title)}</h3><div class="card-bottom"><span>${record.chipYear ? `${record.chipYear} · ${escapeHTML(record.yearStatus)}` : 'Chip year · not established'}</span><span class="expand" aria-hidden="true">+</span></div></div></summary><div class="detail"></div>`;
  element.addEventListener('toggle', () => {
    if (!element.open || element.dataset.loaded) return;
    element.dataset.loaded = 'true';
    element.querySelector('.detail').innerHTML = `<h4>Device record</h4><p>${escapeHTML(record.dieSize || 'Die dimensions not specified.')}<br>Article published: ${escapeHTML(record.published)}<br>Chip year: ${record.chipYear ? `${record.chipYear} (${escapeHTML(record.yearStatus)})` : 'not established by a verified source.'}</p>${record.yearSource ? `<a class="source" href="${escapeHTML(safeURL(record.yearSource))}" target="_blank" rel="noopener">Chip year reference ↗</a><p>${escapeHTML(record.yearNote)}</p>` : ''}${record.yearEvidence.length ? `<h4>Dated passages in the source</h4><p>These may refer to manufacture, design, or historical context.</p>${record.yearEvidence.map(e=>`<blockquote>${escapeHTML(e.text)}</blockquote>`).join('')}` : ''}<h4>Image gallery · ${record.images.length} views</h4><div class="gallery">${record.images.map((img,index)=>`<button data-image="${index}" aria-label="Enlarge ${escapeHTML(record.title)} image ${index+1}">${imageMarkup(img, record.title + ' — image ' + (index+1))}<span>${String(index+1).padStart(2,'0')} ↗</span></button>`).join('')}</div><h4>Source notes</h4><p class="notes">${escapeHTML(record.text || 'See the original article for details.')}</p>${record.links?.length ? `<h4>References from the article</h4><div class="reference-links">${record.links.map(link=>`<a href="${escapeHTML(safeURL(link.url))}" target="_blank" rel="noopener">${escapeHTML(link.label)} ↗</a>`).join('')}</div>` : ''}<a class="source" href="${escapeHTML(safeURL(record.source))}" target="_blank" rel="noopener">Read the original on Zeptobars ↗</a><p>Images & notes © Zeptobars · CC BY 3.0<br>Archive page ${record.archivePage}</p>`;
    element.querySelectorAll('[data-image]').forEach(button=>button.addEventListener('click',()=>openViewer(record,Number(button.dataset.image))));
  });
  return element;
}
function filter() {
  const query = $('search').value.trim().toLowerCase(); const year = $('year').value;
  state.filtered = state.records.filter(r=>(state.category === 'All devices' || r.category === state.category) && (!year || (year === 'unknown' ? !r.chipYear : year.startsWith('chip:') ? String(r.chipYear) === year.slice(5) : r.published.startsWith(year.slice(8)))) && (!query || `${r.title} ${r.text} ${r.category} ${r.chipYear || ''}`.toLowerCase().includes(query)));
  const sort = $('sort').value;
  state.filtered.sort((a,b)=>sort === 'name' ? a.title.localeCompare(b.title) : sort === 'chip-year' ? (a.chipYear ?? 9999)-(b.chipYear ?? 9999) : sort === 'oldest' ? a.published.localeCompare(b.published) : b.published.localeCompare(a.published));
  state.limit=24; render();
}
function render(append = false) {
  const start = append ? $('grid').children.length : 0;
  if (!append) $('grid').replaceChildren();
  const fragment = document.createDocumentFragment(); state.filtered.slice(start,state.limit).forEach(r=>fragment.append(card(r))); $('grid').append(fragment);
  $('result-count').textContent = `${state.filtered.length.toLocaleString()} entries · showing ${Math.min(state.limit,state.filtered.length)}`;
  $('empty').hidden = state.filtered.length !== 0; $('more').hidden = state.limit >= state.filtered.length;
}
function showImage() {
  const img = state.images[state.imageIndex]; $('viewer-image').src = safeURL(img.full); $('viewer-image').alt = img.alt || `${state.activeTitle} — image ${state.imageIndex+1}`;
  $('original').href = safeURL(img.full); $('viewer-caption').textContent=state.activeTitle; $('viewer-position').textContent=`${state.imageIndex+1} / ${state.images.length}`;
  $('prev-image').disabled = state.imageIndex===0; $('next-image').disabled = state.imageIndex===state.images.length-1;
}
function openViewer(record,index) { state.images=record.images; state.activeTitle=record.title; state.imageIndex=index; showImage(); $('viewer').showModal(); document.body.style.overflow='hidden'; }
$('close-viewer').addEventListener('click',()=>$('viewer').close());
$('viewer').addEventListener('close',()=>{document.body.style.overflow=''; $('viewer-image').removeAttribute('src');});
$('viewer').addEventListener('click',event=>{if(event.target===$('viewer')) $('viewer').close();});
$('prev-image').addEventListener('click',()=>{if(state.imageIndex>0){state.imageIndex--;showImage();}});
$('next-image').addEventListener('click',()=>{if(state.imageIndex<state.images.length-1){state.imageIndex++;showImage();}});
document.addEventListener('keydown',event=>{
  if($('viewer').open){if(event.key==='ArrowLeft') $('prev-image').click(); if(event.key==='ArrowRight') $('next-image').click(); return;}
  if(event.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();$('search').focus();}
});
document.addEventListener('error',event=>{if(event.target.tagName==='IMG'){event.target.classList.add('image-failed');event.target.alt='Image unavailable from Zeptobars — use the original article link.';}},true);
$('search').addEventListener('input',filter); $('year').addEventListener('change',filter); $('sort').addEventListener('change',filter);
$('more').addEventListener('click',()=>{const start=$('grid').children.length;state.limit+=24;render(true);$('grid').children[start]?.querySelector('summary').focus();});
$('reset').addEventListener('click',()=>{ $('search').value=''; $('year').value=''; state.category='All devices';document.querySelectorAll('.categories button').forEach(b=>b.setAttribute('aria-pressed',String(b.textContent==='All devices')));filter(); });
async function init() {
  $('error').hidden=true;
  try {
    const response=await fetch('assets/chips/catalog.json'); if(!response.ok) throw new Error(`HTTP ${response.status}`); const data=await response.json(); state.records=data.records;
    $('total').textContent=state.records.length; $('image-total').textContent=state.records.reduce((n,r)=>n+r.images.length,0).toLocaleString(); $('page-total').textContent=data.archivePages; $('snapshot').textContent=`ARCHIVE SNAPSHOT / ${data.collected}`;
    const hero=state.records.find(r=>/U1001C/.test(r.title)&&r.images.length) || state.records.find(r=>r.images.length); if(hero){$('hero-image').src=hero.images[0].src;$('hero-image').alt=hero.title+' semiconductor die';$('hero-title').textContent=hero.title;$('hero-link').href=hero.source;$('hero-link').target='_blank';$('hero-link').rel='noopener';}
    $('year').replaceChildren(new Option('All years',''),new Option('Chip year unknown','unknown')); const chipYears=document.createElement('optgroup'); chipYears.label='Chip dates (see date type)'; [...new Set(state.records.map(r=>r.chipYear).filter(Boolean))].sort((a,b)=>b-a).forEach(y=>chipYears.append(new Option(String(y),'chip:'+y))); $('year').append(chipYears); const articleYears=document.createElement('optgroup'); articleYears.label='Article publication'; [...new Set(state.records.map(r=>r.published.slice(0,4)))].sort().reverse().forEach(y=>articleYears.append(new Option(y,'article:'+y))); $('year').append(articleYears);
    $('categories').replaceChildren(); ['All devices',...new Set(state.records.map(r=>r.category).sort())].forEach(name=>{const b=document.createElement('button');b.textContent=name;b.setAttribute('aria-pressed',String(name===state.category));b.addEventListener('click',()=>{state.category=name;[...$('categories').children].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));filter();});$('categories').append(b);});filter();
  } catch(error){$('error').hidden=false; $('result-count').textContent='Collection unavailable';console.error(error);}
}
$('retry').addEventListener('click',init); init();
