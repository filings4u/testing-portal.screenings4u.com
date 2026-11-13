(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString():'—';
const transitions={requested:['approved','cancelled'],approved:['packing','cancelled'],packing:['shipped','cancelled'],shipped:['delivered'],delivered:[],cancelled:[]};
async function init(){
 const root=document.getElementById('tmPage');if(!root)return;
 root.innerHTML='<div class="tm-page-head"><div><span class="tm-kicker">SCREENINGS4U / LAB ACCOUNTS</span><h1>Customer Supply Requests</h1><p>Review laboratory supply requests, fulfillment, shipping, and customer updates.</p></div><div class="tm-actions"><a class="tm-btn" href="lab-supplies.html">Lab Supplies</a><button class="tm-btn primary" id="requestRefresh">Refresh</button></div></div><div id="requestNotice" role="status"></div><div class="tm-card"><div class="tm-card-body"><label for="requestSearch">Search customer requests</label><input id="requestSearch" type="search" placeholder="Customer, item, tracking, status" style="width:100%;min-height:42px;padding:9px;margin:8px 0 16px;border:1px solid #ced9e9;border-radius:8px"><div class="tm-table-wrap"><table class="tm-table"><thead><tr><th>Requested</th><th>Customer</th><th>Items</th><th>Status</th><th>Shipping</th><th>Action</th></tr></thead><tbody id="requestRows"><tr><td colspan="6">Loading…</td></tr></tbody></table></div></div></div><section id="requestDetail" class="tm-card" style="margin-top:18px" hidden></section>';

 root.insertAdjacentHTML('beforeend','<section class="tm-card" style="margin-top:18px"><div class="tm-card-head"><h2>C/TPA Supply Orders</h2><button class="tm-btn" id="ctpaSupplyRefresh" type="button">Refresh</button></div><div class="tm-card-body"><p id="ctpaSupplyMessage">Loading paid orders</p><div class="tm-table-wrap"><table class="tm-table"><thead><tr><th>Order</th><th>Recipient</th><th>Supplies</th><th>Status</th><th></th></tr></thead><tbody id="ctpaSupplyRows"></tbody></table></div><div id="ctpaSupplyDetail"></div></div></section>');
 async function loadCtpaSupplyOrders(){
  const message=root.querySelector('#ctpaSupplyMessage');
  try{
   const result=await TestingAuth.invoke('testing-ctpa-supply-orders',{action:'list'});
   const orders=result.orders||[];
   message.textContent=orders.length+' paid C/TPA supply orders';
   root.querySelector('#ctpaSupplyRows').innerHTML=orders.map(o=>'<tr><td>'+esc(o.order_number)+'</td><td>'+esc(o.company_name)+'</td><td>'+esc((o.order_items||[]).map(x=>x.quantity+' x '+(x.metadata?.name||'Supply')).join(', '))+'</td><td>'+esc(o.metadata?.shipment_status||'new')+'</td><td><button class="tm-btn" data-ctpa-order="'+esc(o.id)+'">Review</button></td></tr>').join('')||'<tr><td colspan="5">No paid C/TPA supply orders.</td></tr>';
   root.querySelectorAll('[data-ctpa-order]').forEach(b=>b.onclick=()=>showCtpaSupplyOrder(orders.find(o=>o.id===b.dataset.ctpaOrder),result.can_update));
  }catch(e){message.textContent='Unable to load paid orders: '+String(e?.message||e)}
 }

 let orders=[];
 const $=s=>root.querySelector(s),status=(s,bad=false)=>{const n=$('#requestNotice');n.textContent=s;n.style.color=bad?'#b42318':'#516882'};
 const labels={requested:'Requested',approved:'Approved',packing:'Packing',shipped:'Shipped',delivered:'Delivered',cancelled:'Cancelled'};
 function items(o){return(o.ic_portal_supply_order_lines||[]).map(l=>String(l.quantity||0)+' × '+(l.ic_portal_supply_items?.name||'Supply item')).join(', ')||'No line items'}
 function draw(){const q=$('#requestSearch').value.trim().toLowerCase(),matched=orders.filter(o=>!q||[o.customer_email,o.status,o.carrier,o.tracking_number,items(o)].join(' ').toLowerCase().includes(q));$('#requestRows').innerHTML=matched.map(o=>'<tr><td>'+esc(date(o.created_at))+'</td><td>'+esc(o.customer_email||'Lab Account Customer')+'</td><td>'+esc(items(o))+'</td><td><span class="tm-badge">'+esc(labels[o.status]||o.status)+'</span></td><td>'+esc([o.carrier,o.tracking_number].filter(Boolean).join(' · ')||'—')+'</td><td><button class="tm-btn" type="button" data-open="'+esc(o.id)+'">Review</button></td></tr>').join('')||'<tr><td colspan="6">No matching supply requests.</td></tr>';$('#requestRows').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>show(b.dataset.open))}
 function show(id){
  const o=orders.find(x=>x.id===id);if(!o)return;
  const next=transitions[o.status]||[],address=o.shipping_address||{};
  const d=$('#requestDetail');d.hidden=false;
  d.innerHTML='<div class="tm-card-head"><div><h2>Request details</h2><p>'+esc(o.customer_email||'Customer')+' · '+esc(date(o.created_at))+'</p></div></div><div class="tm-card-body"><p><strong>Items:</strong> '+esc(items(o))+'</p><p><strong>Shipping address:</strong> '+esc(typeof address==='string'?address:Object.values(address).filter(v=>typeof v==='string').join(', '))+'</p><p><strong>Current status:</strong> '+esc(labels[o.status]||o.status)+'</p><p><strong>Tracking:</strong> '+esc([o.carrier,o.tracking_number].filter(Boolean).join(' · ')||'Not shipped')+'</p>'+(next.length?'<form id="requestUpdate"><div class="tm-field"><label for="requestNext">Next status</label><select id="requestNext">'+next.map(v=>'<option value="'+esc(v)+'">'+esc(labels[v]||v)+'</option>').join('')+'</select></div><div class="tm-field"><label for="requestCarrier">Carrier</label><select id="requestCarrier"><option value="">Select carrier</option>'+['UPS','FedEx','USPS'].map(carrier=>'<option value="'+carrier+'"'+(String(o.carrier||'').toLowerCase()===carrier.toLowerCase()?' selected':'')+'>'+carrier+'</option>').join('')+'</select></div><div class="tm-field"><label for="requestTracking">Tracking number</label><input id="requestTracking" value="'+esc(o.tracking_number||'')+'" maxlength="160"></div><div class="tm-field"><label for="requestNotes">Internal notes</label><textarea id="requestNotes" rows="3" maxlength="1000" placeholder="Optional fulfillment note"></textarea></div><button class="tm-btn primary" id="requestSave" type="submit">Save update</button><p id="requestSaveNotice" role="status"></p></form>':'<p>This request is in a final state.</p>')+'</div>';
  d.scrollIntoView({behavior:'smooth',block:'nearest'});
  const form=$('#requestUpdate');
  const syncCarrier=()=>{if(!form)return;const shipped=$('#requestNext').value==='shipped';$('#requestCarrier').required=shipped;$('#requestTracking').required=shipped;};
  if(form){$('#requestNext').addEventListener('change',syncCarrier);syncCarrier()}

  if(form)form.onsubmit=async e=>{
   e.preventDefault();const button=$('#requestSave'),out=$('#requestSaveNotice');button.disabled=true;out.textContent='Saving…';
   try{const result=await TestingAuth.invoke('testing-lab-supply-requests',{action:'transition',id:o.id,previous_status:o.status,status:$('#requestNext').value,carrier:$('#requestCarrier').value,tracking_number:$('#requestTracking').value,notes:$('#requestNotes').value});out.textContent=result.email_status==='sent'?'Saved. Customer notification sent.':result.email_status==='not_required'?'Saved. No notification required.':'Saved, but customer notification was not confirmed ('+result.email_status+').';await load();d.hidden=true}
   catch(err){out.textContent=String(err?.message||err)}finally{button.disabled=false}
  };
 }
 async function load(){status('Loading live supply requests…');try{const d=await TestingAuth.invoke('testing-lab-supply-requests',{action:'list'});orders=d.orders||[];status(orders.length+' customer requests · Live screenings4u records');draw()}catch(e){status(String(e?.message||e),true);$('#requestRows').innerHTML='<tr><td colspan="6">Unable to load requests.</td></tr>'}}
 $('#requestSearch').oninput=draw;$('#requestRefresh').onclick=load;await load();
}
window.TestingSupplyRequests=Object.freeze({init});
})();