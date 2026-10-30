(()=>{'use strict';
const $=s=>document.querySelector(s),esc=v=>window.TestingShell.esc(String(v??'')),qs=new URLSearchParams(location.search),type=document.body.dataset.page||'labcorp-deliveries';
const dt=v=>v?new Date(v).toLocaleString():'—';
async function api(action,extra={}){return window.TestingAuth.invoke('testing-labcorp-delivery-inbox',{action,...extra})}
const tabs=[['labcorp-deliveries.html','Delivery Inbox'],['labcorp-status-updates.html','Status Updates'],['labcorp-incoming-results.html','Lab Results'],['labcorp-coc-documents.html','COC Documents']];
function head(t){return '<div class="tm-page-head"><div><span class="tm-kicker">SCREENINGS4U TESTING · LABCORP</span><h1>'+esc(t)+'</h1><p>Secure inbound Labcorp notifications and documents, linked to existing orders.</p></div><div class="tm-actions"><button class="tm-btn primary" id="refresh">Refresh</button></div></div><div class="tm-subnav">'+tabs.map(([href,text])=>'<a class="tm-btn" href="'+href+'">'+esc(text)+'</a>').join('')+'</div>'}
const classification={positive:'Positive',negative:'Negative',cancelled:'Cancelled',abnormal:'Abnormal'};
const categoryPages=[...Object.keys(classification).map(k=>['labcorp-'+k+'-results.html',classification[k]+' Results']),...Object.keys(classification).map(k=>['labcorp-'+k+'-cocs.html',classification[k]+' COCs'])];
function badge(x){return '<span class="tm-badge">'+esc(x)+'</span>'}
function table(h,body){return '<div class="tm-table-wrap"><table class="tm-table"><thead><tr>'+h.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>'}
function link(x){return '<a class="tm-btn" href="labcorp-delivery-detail.html?id='+encodeURIComponent(x)+'">View Details</a>'}
async function list(){
 const data=await api('list'),orders=new Map(data.orders.map(x=>[x.id,x]));const pick=type==='labcorp-status-updates'?'status':type==='labcorp-incoming-results'?'result':type==='labcorp-coc-documents'?'coc':null;
 const match=type.match(/^labcorp-(positive|negative|cancelled|abnormal)-(results|cocs)$/);const selected=match?.[1]||null;const kind=match?.[2]==='results'?'result':match?.[2]==='cocs'?'coc':pick;
 const events=data.events.filter(e=>{if(kind&&e.event_type!=='labcorp_'+kind+'_received')return false;if(!selected)return true;const o=orders.get(e.labcorp_order_id)||{};const value=String(kind==='result'?o.result_summary?.overall_specimen_result:e.classification||'').toLowerCase().trim();return value===selected;});
 const title=selected?'Labcorp '+classification[selected]+' '+(kind==='coc'?'COCs':'Results'):type==='labcorp-status-updates'?'Labcorp Status Updates':type==='labcorp-incoming-results'?'Labcorp Results':type==='labcorp-coc-documents'?'Labcorp COC Documents':'Labcorp Delivery Inbox';
 $('#tmPage').innerHTML=head(title)+'<section class="tm-card"><div class="tm-card-head"><h2>Result & COC Categories</h2></div><div class="tm-card-body tm-actions">'+categoryPages.map(([href,label])=>'<a class="tm-btn" href="'+href+'">'+label+'</a>').join('')+'</div></section><section class="tm-card"><div class="tm-card-head"><div><h2>'+events.length+' Recent Deliveries</h2><p>Latest 150 inbound events. Only authorized testing staff can access this information. Categories are shown only when supplied and classified by Labcorp.</p></div></div>'+table(['Received','Type','Labcorp Order','Account','Status','Actions'],events.map(e=>{const o=orders.get(e.labcorp_order_id)||{};return '<tr><td>'+esc(dt(e.created_at))+'</td><td>'+badge(e.event_type.replace('labcorp_','').replace('_received',''))+'</td><td>'+esc(o.labcorp_order_number||e.labcorp_order_id)+'</td><td>'+esc(o.account_number||'—')+'</td><td>'+esc(o.labcorp_status_text||o.status||'—')+'</td><td>'+link(e.labcorp_order_id)+'</td></tr>'}).join('')||'<tr><td colspan="6" class="tm-empty">No deliveries received for this category yet.</td></tr>')+'</section>';
 $('#refresh').onclick=list;
}
async function detail(){
 const id=qs.get('id');if(!id)throw Error('Missing order identifier');
 const d=await api('detail',{id}),o=d.order;
 const paths=[...new Set([o.coc_storage_path,...d.events.flatMap(e=>e.payload?.storage_paths||[])].filter(Boolean))];
 const summary=JSON.stringify(o.result_summary||{},null,2);
 $('#tmPage').innerHTML=head('Labcorp Delivery Details')+'<section class="tm-card"><div class="tm-card-head"><h2>Order '+esc(o.labcorp_order_number||o.id)+'</h2></div><div class="tm-card-body tm-summary-list">'+[['Account',o.account_number],['Location',o.account_location_code],['Status',o.labcorp_status_text||o.status],['Labcorp Status ID',o.labcorp_status_id],['Accession',o.accession_number],['Specimen',o.specimen_id],['Result Received',dt(o.resulted_at)],['Last Updated',dt(o.last_synced_at)]].map(([k,v])=>'<div class="tm-summary-row"><span>'+esc(k)+'</span><strong>'+esc(v||'—')+'</strong></div>').join('')+'</div></section>'+
 '<section class="tm-card"><div class="tm-card-head"><h2>Results</h2></div><div class="tm-card-body"><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(summary)+'</pre></div></section>'+
 '<section class="tm-card"><div class="tm-card-head"><h2>Chain of Custody Documents</h2></div><div class="tm-card-body">'+(paths.length?paths.map((p,i)=>'<button class="tm-btn" data-path="'+esc(p)+'">Open Secure COC '+(i+1)+'</button>').join(' '):'No COC documents received.')+'</div></section>'+
 '<section class="tm-card"><div class="tm-card-head"><h2>Inbound History</h2></div>'+table(['Received','Type','Status'],d.events.map(e=>'<tr><td>'+esc(dt(e.created_at))+'</td><td>'+esc(e.event_type)+'</td><td>'+esc(e.labcorp_status_id??'—')+'</td></tr>').join('')||'<tr><td colspan="3" class="tm-empty">No incoming events yet.</td></tr>')+'</section>';
 $('#refresh').onclick=detail;
 document.querySelectorAll('[data-path]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api('document',{id,path:b.dataset.path});window.open(r.url,'_blank','noopener,noreferrer')}catch(e){alert(e.message||String(e))}finally{b.disabled=false}});
}
async function init(){try{if(type==='labcorp-delivery-detail')await detail();else await list()}catch(e){$('#tmPage').innerHTML=head('Labcorp Delivery')+'<div class="tm-banner error">'+esc(e.message||String(e))+'</div>'}}
window.TestingPages=Object.freeze({init});
})();