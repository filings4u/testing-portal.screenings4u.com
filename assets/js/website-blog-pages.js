(()=>{'use strict';
const $=s=>document.querySelector(s),esc=v=>window.TestingShell.esc(v);
const qs=()=>new URLSearchParams(location.search),id=()=>qs().get('id')||'';
const dt=v=>v?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(v)):'—';
const badge=v=>{const s=String(v||'').toLowerCase(),c=['active','published','public'].includes(s)?'ok':['draft','hidden'].includes(s)?'warn':['archived','inactive'].includes(s)?'bad':'';return `<span class="tm-badge ${c}">${esc(v||'—')}</span>`};
async function websiteApi(action,extra={}){return window.TestingAuth.invoke(window.TESTING_PORTAL_CONFIG.websiteFunction,{action,...extra})}
async function blogApi(action,extra={}){return window.TestingAuth.invoke(window.TESTING_PORTAL_CONFIG.blogFunction,{action,...extra})}
function head(title,desc,actions=''){return `<div class="tm-page-head"><div><span class="tm-kicker">SCREENINGS4U TESTING</span><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>${actions?`<div class="tm-actions">${actions}</div>`:''}</div>`}
function table(headers,rows,empty='No records found.'){return `<div class="tm-table-wrap"><table class="tm-table"><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="tm-empty">${esc(empty)}</td></tr>`}</tbody></table></div>`}
function field(label,name,value='',type='text',extra=''){return `<div class="tm-field"><label for="${name}">${esc(label)}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value??'')}" ${extra}></div>`}
function textarea(label,name,value='',rows=6){return `<div class="tm-field wide"><label for="${name}">${esc(label)}</label><textarea id="${name}" name="${name}" rows="${rows}">${esc(value??'')}</textarea></div>`}
function select(label,name,opts,val=''){return `<div class="tm-field"><label for="${name}">${esc(label)}</label><select id="${name}" name="${name}">${opts.map(o=>`<option value="${esc(o[0])}" ${String(o[0])===String(val)?'selected':''}>${esc(o[1])}</option>`).join('')}</select></div>`}
function fd(f){return Object.fromEntries(new FormData(f).entries())}
const lines=v=>String(v||'').split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean)
function toast(msg,bad=false){let t=document.querySelector('.tm-toast');if(!t){t=document.createElement('div');t.className='tm-toast';document.body.appendChild(t)}t.className='tm-toast'+(bad?' error':'');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}
function dialog(title,message,onConfirm){const b=document.createElement('div');b.className='tm-dialog-backdrop';b.innerHTML=`<div class="tm-dialog"><div class="tm-dialog-brand"><img src="images/logo2.png" alt="screenings4u"></div><div class="tm-dialog-body"><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="tm-dialog-actions"><button class="tm-btn" data-cancel>Cancel</button><button class="tm-btn danger" data-confirm>Confirm</button></div></div></div>`;document.body.appendChild(b);b.querySelector('[data-cancel]').onclick=()=>b.remove();b.querySelector('[data-confirm]').onclick=async()=>{try{await onConfirm();b.remove()}catch(e){toast(e.message||String(e),true)}}}
function pageNav(p){const x=encodeURIComponent(p.id);return `<div class="tm-subnav"><a class="tm-btn" href="website-page.html?id=${x}">Page Record</a><a class="tm-btn" href="website-history.html">Website History</a>${p.route?`<a class="tm-btn" target="_blank" rel="noopener" href="https://screenings4u.com${esc(p.route)}">Open Public Page</a>`:''}</div>`}
function blogNav(p){const x=encodeURIComponent(p.id);return `<div class="tm-subnav"><a class="tm-btn" href="blog-post.html?id=${x}">Post Record</a><a class="tm-btn" href="blog-media.html">Media</a>${p.status==='published'&&p.slug?`<a class="tm-btn" target="_blank" rel="noopener" href="https://screenings4u.com/blog.html?slug=${encodeURIComponent(p.slug)}">Open Published Post</a>`:''}</div>`}

async function website(){
 return head('Website','Manage the screenings4u.com page registry, SEO metadata, and managed content records. Static HTML changes are not falsely treated as deployed content.')+
 `<section class="tm-card"><div class="tm-card-head"><div><h2>Website Management</h2><p>screenings4u.com is the public site for screenings4u, LLC testing, background checks, DNA testing, and related testing services.</p></div></div><div class="tm-card-body"><div class="tm-summary-list"><div class="tm-summary-row"><span>Public Website</span><strong><a target="_blank" rel="noopener" href="https://screenings4u.com">screenings4u.com</a></strong></div><div class="tm-summary-row"><span>Managed Pages</span><strong><a href="website-pages.html">Open Page Inventory</a></strong></div><div class="tm-summary-row"><span>Blog</span><strong><a href="blog.html">Manage Blog Posts</a></strong></div><div class="tm-summary-row"><span>Blog Media</span><strong><a href="blog-media.html">Manage Media</a></strong></div><div class="tm-summary-row"><span>Audit History</span><strong><a href="website-history.html">Open Website History</a></strong></div></div></div></section>`+
 `<div class="tm-banner warn"><strong>Static page deployment boundary</strong><div>Website page records manage inventory, SEO, route, status, and managed content metadata. A static HTML page changes on the live site only when that page is wired to consume managed content or when the website repository itself is updated and deployed. Blog posts are different: the current public blog reads the Supabase blog table directly.</div></div>`
}

async function pages(){
 const d=await websiteApi('list_pages');
 const rows=(d.pages||[]).map(p=>`<tr data-search="${esc(((p.title||'')+' '+(p.route||'')+' '+(p.file_name||'')+' '+(p.page_type||'')).toLowerCase())}" data-status="${esc(p.status)}"><td><a href="website-page.html?id=${p.id}"><strong>${esc(p.title)}</strong></a><small>${esc(p.route)}</small></td><td>${esc(p.page_type||'—')}</td><td>${badge(p.status)}</td><td>${p.nav_visible?'Yes':'No'}</td><td>${p.seo_index?'Index':'Noindex'}</td><td>${esc(p.file_name||'Managed')}</td><td><a class="tm-btn" href="website-page.html?id=${p.id}">Manage</a></td></tr>`).join('');
 return head('Website Pages','Real screenings4u.com page inventory and managed page records.','<a class="tm-btn primary" href="website-page-create.html">Create Managed Page</a>')+`<div class="tm-searchbar"><input id="tmSearch" type="search" placeholder="Search website pages…"><select id="tmFilter"><option value="">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div><section class="tm-card">${table(['Page','Type','Status','Navigation','SEO','File',''],rows,'No website pages found.')}</section>`
}

function pageForm(p={}){
 let cj='{}';try{cj=JSON.stringify(p.content_json||{},null,2)}catch{}
 return `${field('Page Title','title',p.title||'')}${field('Slug','slug',p.slug||'')}${field('Route','route',p.route||'')}${field('Static File Name','file_name',p.file_name||'')}${select('Page Type','page_type',[['marketing','Marketing'],['application','Application / Form'],['legal','Legal'],['blog_index','Blog Index'],['standard','Standard']],p.page_type||'marketing')}${select('Status','status',[['draft','Draft'],['active','Active'],['archived','Archived']],p.status||'draft')}${textarea('Description','description',p.description||'',4)}${field('SEO Title','seo_title',p.seo_title||'')}${textarea('SEO Description','seo_description',p.seo_description||'',4)}${field('Canonical URL','canonical_url',p.canonical_url||'')}${textarea('Managed Content JSON','content_json',cj,12)}<div class="wide tm-check"><label><input type="checkbox" name="nav_visible" ${p.nav_visible?'checked':''}> Navigation Visible</label></div><div class="wide tm-check"><label><input type="checkbox" name="seo_index" ${p.seo_index!==false?'checked':''}> Allow Search Indexing</label></div>${textarea('Change Note','notes','',3)}`
}

async function pageCreate(){
 return head('Create Website Page','Create a managed page record for screenings4u.com. This does not silently deploy a new static HTML file.','<a class="tm-btn" href="website-pages.html">Back to Website Pages</a>')+
 `<section class="tm-card"><div class="tm-card-head"><div><h2>Managed Page Record</h2><p>Use this for new page metadata/content records. Deployment of a brand-new static route still requires the public website build unless the route is dynamically rendered.</p></div></div><div class="tm-card-body"><form id="f" class="tm-builder-form">${pageForm({status:'draft',seo_index:true})}<div class="wide tm-actions"><button class="tm-btn primary" type="submit">Create Page Record</button></div></form></div></section>`
}

async function pageRecord(){
 const d=await websiteApi('get_page',{id:id()}),p=d.page;
 return head('Website Page',`${p.title} · ${p.route}`,`<a class="tm-btn" href="website-pages.html">All Website Pages</a>`)+pageNav(p)+
 `<div class="tm-banner ${p.file_name?'warn':''}"><strong>${p.file_name?'Static HTML page':'Managed content page'}</strong><div>${p.file_name?'Saving this record updates website management metadata. It does not rewrite the deployed '+esc(p.file_name)+' file by itself.':'This record can be consumed by a dynamically wired public page.'}</div></div>`+
 `<section class="tm-card"><div class="tm-card-head"><h2>Page Record</h2></div><div class="tm-card-body"><form id="f" class="tm-builder-form">${pageForm(p)}<div class="wide tm-actions"><button class="tm-btn primary" type="submit">Save Page Record</button></div></form></div></section>`
}

async function history(){
 const d=await websiteApi('history');
 const rows=(d.events||[]).map(e=>`<tr><td>${dt(e.created_at)}</td><td>${esc(e.entity_type)}</td><td><strong>${esc(e.event_type)}</strong></td><td>${esc(e.notes||'—')}</td><td>${esc(JSON.stringify(e.metadata||{}))}</td></tr>`).join('');
 return head('Website History','Audit history for screenings4u.com managed page and blog changes.','<a class="tm-btn" href="website.html">Back to Website</a>')+`<section class="tm-card">${table(['Date','Entity','Event','Notes','Metadata'],rows,'No website history found.')}</section>`
}

async function blog(){
 const d=await blogApi('list');
 const rows=(d.posts||[]).map(p=>`<tr data-search="${esc(((p.title||'')+' '+(p.slug||'')+' '+(p.category||'')+' '+(p.author_name||'')).toLowerCase())}" data-status="${esc(p.status)}"><td><a href="blog-post.html?id=${p.id}"><strong>${esc(p.title)}</strong></a><small>${esc(p.slug||'')}</small></td><td>${esc(p.category||'—')}</td><td>${badge(p.status)}</td><td>${p.show_website?'Yes':'No'}</td><td>${p.featured?'Yes':'No'}</td><td>${dt(p.published_at||p.created_at)}</td><td><a class="tm-btn" href="blog-post.html?id=${p.id}">Manage</a></td></tr>`).join('');
 return head('Blog','Manage screenings4u.com Resources & Insights posts stored in the live screenings4u_blog table.','<a class="tm-btn primary" href="blog-create.html">Create Blog Post</a><a class="tm-btn" href="blog-media.html">Media</a>')+`<div class="tm-searchbar"><input id="tmSearch" type="search" placeholder="Search blog posts…"><select id="tmFilter"><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div><section class="tm-card">${table(['Post','Category','Status','Website','Featured','Date',''],rows,'No Screenings4u blog posts found.')}</section>`
}

function blogForm(p={}){
 const html=p.content_html||'';
 return `<div class="wide tm-field"><label for="title">Post title</label><input id="title" name="title" required maxlength="180" value="${esc(p.title||'')}"></div>
 <div class="tm-field"><label for="slug">URL slug</label><input id="slug" name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="my-article-slug" value="${esc(p.slug||'')}"><small>Public article: screenings4u.com/blog.html?slug=your-slug</small></div>
 ${field('Category','category',p.category||'Insights')}${field('Author','author_name',p.author_name||'screenings4u')}
 ${textarea('Short excerpt','excerpt',p.excerpt||'',3)}
 <div class="wide tm-editor-block"><div class="tm-editor-title"><strong>Article editor</strong><span>Format content using the toolbar · Changes are saved with Save Draft / Save Post</span></div>
 <div id="tmEditorToolbar" class="tm-editor-toolbar" role="toolbar" aria-label="Article formatting">
 <select data-format="block" aria-label="Text style"><option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option></select>
 <select data-format="font" aria-label="Font"><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Trebuchet MS">Trebuchet</option></select>
 <button type="button" data-cmd="bold" title="Bold"><b>B</b></button><button type="button" data-cmd="italic" title="Italic"><i>I</i></button><button type="button" data-cmd="underline" title="Underline"><u>U</u></button><button type="button" data-cmd="insertUnorderedList" title="Bullets">• List</button><button type="button" data-cmd="insertOrderedList" title="Numbered list">1. List</button>
 <button type="button" data-cmd="justifyLeft" title="Align left">Left</button><button type="button" data-cmd="justifyCenter" title="Align center">Center</button><button type="button" data-cmd="justifyRight" title="Align right">Right</button>
 <button type="button" data-cmd="undo" title="Undo">↶ Undo</button><button type="button" data-cmd="redo" title="Redo">↷ Redo</button>
 <button type="button" data-insert="link">Link</button><button type="button" data-insert="button">Button</button><button type="button" data-insert="image">Image</button><button type="button" data-insert="divider">Divider</button><button type="button" data-insert="spacer">Spacer</button><button type="button" data-insert="clear">Clear format</button>
 <label class="tm-color-label">Text <input type="color" data-color="foreColor" value="#222222" aria-label="Text color"></label>
 </div><div id="tmRichEditor" class="tm-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Blog post content" data-initial="${esc(html)}"></div><textarea name="content_html" id="content_html" hidden></textarea>
 <div class="tm-editor-foot"><span id="tmWordCount">0 words</span><span>Use Preview to see the finished post before publishing.</span></div></div>
 <div class="wide tm-field"><label for="featured_image_url">Featured image URL</label><input id="featured_image_url" name="featured_image_url" value="${esc(p.featured_image_url||'')}"><div class="tm-actions"><label class="tm-btn" for="tmFeaturedUpload">Upload featured image</label><input id="tmFeaturedUpload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><a class="tm-btn" href="blog-media.html">Open Media Library</a></div></div>
 <div class="wide tm-seo-head"><h3>Search engine optimization</h3><p>Control how this post appears in search and social sharing.</p></div>
 ${field('SEO title','seo_title',p.seo_title||'')}${textarea('Meta description','seo_description',p.seo_description||'',3)}
 ${field('Canonical URL','canonical_url',p.canonical_url||'')}${field('Keywords (comma separated)','seo_keywords',Array.isArray(p.seo_keywords)?p.seo_keywords.join(', '):'')}
 ${field('Image alt text','featured_image_alt',p.featured_image_alt||'')}${textarea('Tags (comma separated)','tags',Array.isArray(p.tags)?p.tags.join(', '):'',2)}
 <div class="wide tm-check"><label><input type="checkbox" name="show_website" ${p.show_website!==false?'checked':''}> Visible on screenings4u.com when published</label></div>
 <div class="wide tm-check"><label><input type="checkbox" name="featured" ${p.featured?'checked':''}> Featured article</label></div>${textarea('Internal change note','notes','',2)}`;
}

async function blogCreate(){
 return head('Create Blog Post','Write, format and save a draft before publishing.','<a class="tm-btn" href="blog.html">Back to Blog</a>')+`<section class="tm-card"><div class="tm-card-head"><div><h2>Blog Post</h2><p>Publishing writes directly to the production screenings4u_blog table consumed by screenings4u.com/blog.html.</p></div></div><div class="tm-card-body"><form id="f" class="tm-builder-form">${blogForm({author_name:'screenings4u'})}<div class="wide tm-actions"><button class="tm-btn primary" type="submit">Create Draft</button></div></form></div></section>`
}

async function blogPost(){
 const d=await blogApi('get',{id:id()}),p=d.post;
 return head('Blog Post',`${p.title} · ${p.status||'draft'}`,`<a class="tm-btn" href="blog.html">All Blog Posts</a>`)+blogNav(p)+
 `<div class="tm-grid"><section class="tm-card two-thirds"><div class="tm-card-head"><div><h2>Post Content</h2><p>Published posts are read directly by the current public blog.</p></div></div><div class="tm-card-body"><form id="f" class="tm-builder-form">${blogForm(p)}<div class="wide tm-actions"><button class="tm-btn primary" type="submit">Save Blog Post</button></div></form></div></section><section class="tm-card one-third"><div class="tm-card-head"><h2>Publishing</h2></div><div class="tm-card-body tm-summary-list">${[['Status',badge(p.status)],['Published',dt(p.published_at)],['Website',p.show_website?'Yes':'No'],['Featured',p.featured?'Yes':'No'],['Updated',dt(p.updated_at)]].map(x=>`<div class="tm-summary-row"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('')}</div><div class="tm-card-body tm-actions vertical">${p.status==='published'?'<button id="unpublish" class="tm-btn">Unpublish</button>':'<button id="publish" class="tm-btn primary">Publish</button>'}<button id="archive" class="tm-btn danger">Archive</button></div></section></div>`
}

async function media(){
 const d=await blogApi('list_media');
 const rows=(d.media||[]).map(m=>`<tr><td><a target="_blank" rel="noopener" href="${esc(m.url)}"><strong>${esc(m.name)}</strong></a><small>${esc(m.path)}</small></td><td>${dt(m.created_at)}</td><td><button class="tm-btn" data-copy="${esc(m.url)}">Copy URL</button></td></tr>`).join('');
 return head('Blog Media','Upload and reuse images from the public testing-blog-images bucket.','<a class="tm-btn" href="blog.html">Back to Blog</a>')+`<div class="tm-grid"><section class="tm-card one-third"><div class="tm-card-head"><div><h2>Upload Image</h2><p>PNG, JPEG, WebP, or GIF up to 10 MB.</p></div></div><div class="tm-card-body"><form id="f"><div class="tm-field"><label for="file">Image File</label><input id="file" name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" required></div><button class="tm-btn primary" type="submit">Upload Image</button></form><div id="uploadedUrl" class="tm-banner" hidden></div></div></section><section class="tm-card two-thirds"><div class="tm-card-head"><h2>Media Library</h2></div>${table(['Image','Uploaded',''],rows,'No blog media found.')}</section></div>`
}

async function blogPreview(){
 const d=await blogApi('get',{id:id()}),p=d.post;
 const clean=window.DOMPurify?window.DOMPurify.sanitize(p.content_html||'',{USE_PROFILES:{html:true}}):esc(p.content_html||'');
 return head('Preview Blog Post','Staff-only preview of the saved version. Unpublished articles are not publicly accessible.',`<a class="tm-btn" href="blog-post.html?id=${encodeURIComponent(p.id)}">Back to Editor</a>${p.status==='published'?`<a class="tm-btn" href="https://screenings4u.com/blog.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Public Article</a>`:''}`)+`<section class="tm-card tm-blog-preview"><div class="tm-card-body"><div class="tm-preview-note">${badge(p.status)} · Draft preview in the management portal</div>${p.featured_image_url?`<img class="tm-preview-cover" alt="${esc(p.featured_image_alt||p.title)}" src="${esc(p.featured_image_url)}">`:''}<p class="tm-preview-category">${esc(p.category||'Insights')}</p><h1>${esc(p.title)}</h1><p class="tm-preview-excerpt">${esc(p.excerpt||'')}</p><div class="tm-preview-body">${clean}</div></div></section>`;
}
const renders={website, 'website-pages':pages,'website-page-create':pageCreate,'website-page':pageRecord,'website-history':history,blog,'blog-create':blogCreate,'blog-post':blogPost,'blog-media':media,'blog-preview':blogPreview};

function pagePayload(f){
 const x=fd(f);
 x.nav_visible=!!f.querySelector('[name="nav_visible"]')?.checked;
 x.seo_index=!!f.querySelector('[name="seo_index"]')?.checked;
 try{x.content_json=x.content_json?.trim()?JSON.parse(x.content_json):{}}catch{throw new Error('Managed Content JSON must be valid JSON.')}
 return x;
}
function blogPayload(f){
 const x=fd(f);
 x.tags=lines(x.tags);x.seo_keywords=lines(x.seo_keywords);x.content_html=window.DOMPurify?window.DOMPurify.sanitize(document.querySelector('#tmRichEditor')?.innerHTML||'',{USE_PROFILES:{html:true}}):'';
 x.show_website=!!f.querySelector('[name="show_website"]')?.checked;
 x.show_customer_portal=!!f.querySelector('[name="show_customer_portal"]')?.checked;
 x.show_employer_portal=!!f.querySelector('[name="show_employer_portal"]')?.checked;
 x.featured=!!f.querySelector('[name="featured"]')?.checked;
 return x;
}
function file64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
function bindSearch(){const s=$('#tmSearch'),f=$('#tmFilter');const run=()=>{const q=(s?.value||'').toLowerCase(),v=f?.value||'';document.querySelectorAll('[data-search]').forEach(el=>el.hidden=!!((q&&!el.dataset.search.includes(q))||(v&&el.dataset.status!==v)))};s?.addEventListener('input',run);f?.addEventListener('change',run)}
function setupRichEditor(){
 const editor=$('#tmRichEditor'),toolbar=$('#tmEditorToolbar');if(!editor||!toolbar)return;
 editor.innerHTML=window.DOMPurify?window.DOMPurify.sanitize(editor.dataset.initial||'',{USE_PROFILES:{html:true}}):'';
 const recount=()=>{$('#tmWordCount').textContent=(editor.innerText.trim().match(/\S+/g)||[]).length+' words'};recount();editor.addEventListener('input',recount);
 const run=(cmd,v)=>{editor.focus();document.execCommand(cmd,false,v||null);recount()};
 toolbar.addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault()});
 toolbar.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const cmd=b.dataset.cmd;if(cmd){run(cmd);return}
 const insert=b.dataset.insert;if(!insert)return;
 if(insert==='clear'){run('removeFormat');return}
 if(['divider','spacer'].includes(insert)){run('insertHTML',insert==='divider'?'<hr>':'<div class="article-spacer" style="height:32px" aria-hidden="true"></div>');return}
 const url=prompt('Enter a complete https:// URL');if(!url||!/^https:\/\/[^\s]+$/i.test(url)){toast('Use a valid HTTPS URL.',true);return}
 if(insert==='link'){run('createLink',url)}else if(insert==='button'){const label=prompt('Button text')||'Learn more';run('insertHTML',`<a class="article-button" href="${esc(url)}">${esc(label)}</a>`)}else if(insert==='image'){run('insertHTML',`<img src="${esc(url)}" alt="" loading="lazy">`)}
 });
 toolbar.querySelector('[data-format="block"]').onchange=e=>run('formatBlock',e.target.value);
 toolbar.querySelector('[data-format="font"]').onchange=e=>run('fontName',e.target.value);
 toolbar.querySelector('[data-color]').onchange=e=>run(e.target.dataset.color,e.target.value);
 $('#title')?.addEventListener('input',e=>{const slug=$('#slug');if(!slug.dataset.edited)slug.value=e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')});
 $('#slug')?.addEventListener('input',e=>{e.target.dataset.edited='true'});
 $('#tmFeaturedUpload')?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const r=await blogApi('upload_image',{file:{name:file.name,mime_type:file.type,base64:await file64(file)}});$('#featured_image_url').value=r.url;toast('Image uploaded and selected. Save the post to keep this change.')}catch(err){toast(err.message||String(err),true)}});
}
function bind(page){
 if(['website-pages','blog'].includes(page))bindSearch();
 if(page==='website-page-create')$('#f').onsubmit=async e=>{e.preventDefault();try{const r=await websiteApi('create_page',pagePayload(e.target));toast('Website page record created.');location.href='website-page.html?id='+encodeURIComponent(r.page.id)}catch(err){toast(err.message||String(err),true)}};
 if(page==='website-page')$('#f').onsubmit=async e=>{e.preventDefault();try{await websiteApi('update_page',{id:id(),...pagePayload(e.target)});toast('Website page record saved.');location.reload()}catch(err){toast(err.message||String(err),true)}};
 if(['blog-create','blog-post'].includes(page))setupRichEditor();
 if(page==='blog-create')$('#f').onsubmit=async e=>{e.preventDefault();try{const r=await blogApi('create',blogPayload(e.target));toast('Blog draft created.');location.href='blog-post.html?id='+encodeURIComponent(r.post.id)}catch(err){toast(err.message||String(err),true)}};
 if(page==='blog-post'){
   const f=$('#f');f.onsubmit=async e=>{e.preventDefault();try{await blogApi('update',{id:id(),...blogPayload(f)});toast('Blog post saved.');location.reload()}catch(err){toast(err.message||String(err),true)}};
   $('#publish')?.addEventListener('click',()=>dialog('Publish Blog Post','Publish this post to screenings4u.com?',async()=>{await blogApi('publish',{id:id()});location.reload()}));
   $('#unpublish')?.addEventListener('click',()=>dialog('Unpublish Blog Post','Remove this post from the public website and return it to draft?',async()=>{await blogApi('unpublish',{id:id()});location.reload()}));
   $('#archive')?.addEventListener('click',()=>dialog('Archive Blog Post','Archive this blog post and remove it from the public website?',async()=>{await blogApi('archive',{id:id()});location.href='blog.html'}));
 }
 if(page==='blog-media'){
   $('#f').onsubmit=async e=>{e.preventDefault();const file=e.target.querySelector('[name="file"]').files[0];if(!file){toast('Choose an image.',true);return}try{const base64=await file64(file),r=await blogApi('upload_image',{file:{name:file.name,mime_type:file.type,base64}});const box=$('#uploadedUrl');box.hidden=false;box.innerHTML=`<strong>Uploaded</strong><div>${esc(r.url)}</div>`;toast('Blog image uploaded.')}catch(err){toast(err.message||String(err),true)}};
   document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast('Image URL copied.')}catch{toast('Could not copy URL.',true)}})
 }
}
async function init(){const page=document.body.dataset.page,m=$('#tmPage');try{m.innerHTML=await renders[page]();bind(page)}catch(e){m.innerHTML=head('Website / Blog','This management page could not be loaded.')+`<div class="tm-banner error"><strong>Unable to load this management page.</strong><div>${esc(e?.message||String(e))}</div></div>`}}
window.TestingPages=Object.freeze({init});
})();