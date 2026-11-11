(()=>{'use strict';
const root=document.getElementById('tmPage');if(!root)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
root.innerHTML='<div class="tm-page-head"><div><span class="tm-kicker">SCREENINGS4U / LAB ACCOUNTS</span><h1>Advanced Lab Services</h1><p>Verify released-result delivery recipients and review customer supply reorder signals. Staff retain control over sensitive result disclosure.</p></div><button id="advancedRefresh" class="tm-btn primary" type="button">Refresh</button></div><p id="advancedStatus" role="status"></p><section class="tm-card"><div class="tm-card-head"><div><h2>Result delivery requests</h2><p>Approve only after verifying recipient authorization and the released testing record. Approval does not automatically email an MRO report.</p></div></div><div class="tm-card-body"><div class="tm-table-wrap"><table class="tm-table"><thead><tr><th>Requested</th><th>Lab Account</th><th>Case</th><th>Recipient</th><th>Status</th><th>Action</th></tr></thead><tbody id="deliveryRows"><tr><td colspan="6">Loading requests…</td></tr></tbody></table></div></div></section><section class="tm-card" style="margin-top:18px"><div class="tm-card-head"><div><h2>Supply reorder signals</h2><p>Customer-reported low inventory; verify quantities before shipment. Fulfill through the existing Lab Supplies workflow.</p></div></div><div class="tm-card-body"><div class="tm-table-wrap"><table class="tm-table"><thead><tr><th>Lab Account</th><th>Supply</th><th>Estimated stock</th><th>Threshold</th><th>Updated</th></tr></thead><tbody id="alertRows"><tr><td colspan="5">Loading supply alerts…</td></tr></tbody></table></div><p><a class="tm-btn" href="lab-supplies.html">Open Lab Supplies</a></p></div></section>';
const status=root.querySelector('#advancedStatus');
const rows=root.querySelector('#deliveryRows'),alertRows=root.querySelector('#alertRows');
const load=async()=>{
 status.textContent='Loading secured Lab Account data…';
 try{
  const r=await TestingAuth.invoke('testing-lab-advanced',{action:'list'});
  status.textContent=(r.requests||[]).length+' result delivery requests · '+(r.supply_alerts||[]).length+' low-stock signals';
  rows.innerHTML=(r.requests||[]).map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleDateString())+'</td><td>'+esc(x.customer_email||'Verified customer')+'</td><td>'+esc(x.case_number||'Unavailable')+' '+(!x.is_released||!x.case_owned?'(verification required)':'')+'</td><td>'+esc(x.recipient_name||'')+' '+esc(x.recipient_email)+'</td><td><span class="tm-badge">'+esc(x.status.replaceAll('_',' '))+'</span></td><td>'+(x.status==='pending_review'&&r.can_edit?'<button class="tm-btn" type="button" data-delivery="'+esc(x.id)+'" data-decision="approved" '+(!x.is_released||!x.case_owned?'disabled':'')+'>Approve</button> <button class="tm-btn" type="button" data-delivery="'+esc(x.id)+'" data-decision="declined">Decline</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="6">No delivery requests.</td></tr>';
  alertRows.innerHTML=(r.supply_alerts||[]).map(x=>'<tr><td>'+esc(x.customer_email||'Verified customer')+'</td><td>'+esc(x.supply_name)+'</td><td>'+esc(x.estimated_on_hand)+'</td><td>'+esc(x.reorder_threshold)+'</td><td>'+esc(new Date(x.updated_at).toLocaleDateString())+'</td></tr>').join('')||'<tr><td colspan="5">No customer low-stock alerts.</td></tr>';
  rows.querySelectorAll('[data-delivery]').forEach(button=>button.onclick=async()=>{
   const approve=button.dataset.decision==='approved';
   const notes=window.prompt(approve?'Enter the authorization verification note (required):':'Reason for declining this delivery request:','');
   if(notes===null)return;
   if(approve&&notes.trim().length<10){status.textContent='Record the recipient authorization verification before approving.';return}
   button.disabled=true;
   try{await TestingAuth.invoke('testing-lab-advanced',{action:'review',id:button.dataset.delivery,decision:button.dataset.decision,staff_notes:notes});await load()}catch(e){status.textContent=e.message||'Could not update the request';button.disabled=false}
  });
 }catch(e){status.textContent=e.message||'Unable to load operations';rows.innerHTML='<tr><td colspan="6">Unable to load.</td></tr>';alertRows.innerHTML='<tr><td colspan="5">Unable to load.</td></tr>'}
};
root.querySelector('#advancedRefresh').onclick=load;load();
})();