(()=>{'use strict';const root=document.getElementById('tmPage');if(!root)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={'lab-account':'Lab Account','lab-account-random-consortium':'Lab Account + Consortium','lab-account-random-consortium-docs':'Lab Account + Consortium + Docs'};
root.innerHTML='<div class="tm-page-head"><div><span class="tm-kicker">SCREENINGS4U / LAB ACCOUNTS</span><h1>Plan Upgrade Purchases</h1><p>Track customer-initiated upgrades. Payments activate plan access automatically after Stripe webhook verification.</p></div><button type="button" id="upgradeRefresh" class="tm-btn primary">Refresh</button></div><div id="upgradeStatus" role="status"></div><section class="tm-card"><div class="tm-card-body"><div class="tm-table-wrap"><table class="tm-table"><thead><tr><th>Submitted</th><th>Customer</th><th>Current plan</th><th>Requested plan</th><th>Status</th><th>Payment</th></tr></thead><tbody id="upgradeRows"><tr><td colspan="6">Loading requests…</td></tr></tbody></table></div></div></section>';
const status=document.getElementById('upgradeStatus'),tbody=document.getElementById('upgradeRows');
const load=async()=>{
 status.textContent='Loading paid upgrade activity…';
 try{
  const d=await TestingAuth.invoke('testing-lab-plan-upgrades',{action:'list'});
  const requests=d.requests||[];
  status.textContent=requests.length+' upgrade transactions · Payments automatically activate verified features';
  tbody.innerHTML=requests.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleDateString())+'</td><td>'+esc(x.customer_email||'Verified customer')+'</td><td>'+esc(names[x.current_plan_sku]||x.current_plan_sku)+'</td><td>'+esc(names[x.target_plan_sku]||x.target_plan_sku)+'</td><td><span class="tm-badge">'+esc(x.status)+'</span></td><td>'+(x.status==='completed'?'Paid & activated':x.status==='checkout_pending'?'Awaiting payment':'—')+'</td></tr>').join('')||'<tr><td colspan="6">No upgrade purchases yet.</td></tr>';
 }catch(e){status.textContent=String(e.message||e);tbody.innerHTML='<tr><td colspan="6">Could not load upgrade activity.</td></tr>'}
};
document.getElementById('upgradeRefresh').onclick=load;load();
})();