(async()=>{
"use strict";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
try{
 const state=await TestingAuth.requireAuth();if(!state)return;
 TestingShell.render(state);TestingSecurity.init();
 const root=document.getElementById("tmPage");
 root.innerHTML='<div class="ship-content"><div class="tm-page-head"><div><span class="tm-kicker">WORKFORCE / TESTING</span><h1>C/TPA Shipment Tracking</h1><p>Publish carrier tracking to the correct C/TPA and employer. Employer emails are sent separately by the C/TPA.</p></div><button type="button" class="ship-refresh" id="shipRefresh">Refresh</button></div><section class="ship-panel"><h2>Publish shipment</h2><form id="shipForm"><div class="ship-fields"><label>C/TPA organization<select name="tenant_id" id="shipTenant" required></select></label><label>Operating workspace<select name="operating_context" id="shipContext"><option value="dot">DOT</option><option value="nondot">NON-DOT</option></select></label><label>Employer / owner-operator<select name="employer_record_id" id="shipEmployer" required></select></label><label>Employer email<select name="employer_email" id="shipEmail" required></select></label><label>Carrier<select name="carrier" required><option>USPS</option><option>FEDEX</option><option>UPS</option></select></label><label>Tracking number<input name="tracking_number" required maxlength="80" autocomplete="off"></label><label>Order reference<input name="order_reference" maxlength="120"></label><label>Shipment status<select name="shipment_status"><option value="preparing">Preparing</option><option value="shipped" selected>Shipped</option><option value="in_transit">In transit</option><option value="out_for_delivery">Out for delivery</option><option value="delivered">Delivered</option><option value="exception">Exception</option></select></label><label>Items shipped<input name="contents" maxlength="500"></label></div><div class="ship-actions"><button type="submit" id="shipSubmit">Publish to C/TPA</button></div><div id="shipMessage" class="ship-status" role="status"></div></form></section><section class="ship-panel"><h2>Published shipments</h2><div class="ship-table-wrap"><table class="ship-table"><thead><tr><th>Employer</th><th>Carrier</th><th>Tracking</th><th>Status</th><th>Workspace</th><th>Employer notified</th></tr></thead><tbody id="shipRows"></tbody></table></div></section></div>';
 const $=id=>document.getElementById(id);
 const call=(action,rest={})=>TestingAuth.invoke("testing-ctpa-tracking",{action,...rest});
 const show=(msg)=>{$("shipMessage").textContent=msg};
 let employers=[];
 async function loadEmployers(){
  const tenant=$("shipTenant").value,context=$("shipContext").value;
  if(!tenant){$("shipEmployer").innerHTML='<option value="">Select C/TPA first</option>';$("shipEmail").innerHTML='<option value="">Select employer first</option>';return}
  const data=await call("employers",{tenant_id:tenant,operating_context:context});
  employers=data.employers||[];
  $("shipEmployer").innerHTML='<option value="">Select employer</option>'+employers.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+'</option>').join("");
  $("shipEmail").innerHTML='<option value="">Select employer first</option>';
 }
 function selectedEmployer(){
  const e=employers.find(x=>x.id===$("shipEmployer").value);
  $("shipEmail").innerHTML=e?.email?'<option value="'+esc(e.email)+'">'+esc(e.email)+'</option>':'<option value="">Employer has no verified email</option>';
 }
 async function loadRows(){
  const r=await call("list");
  $("shipRows").innerHTML=(r.shipments||[]).map(s=>'<tr><td>'+esc(s.employer_name)+'</td><td>'+esc(s.carrier)+'</td><td>'+esc(s.tracking_number)+'</td><td>'+esc(s.shipment_status)+'</td><td>'+esc(s.operating_context.toUpperCase())+'</td><td>'+esc(s.employer_notified_at?new Date(s.employer_notified_at).toLocaleDateString():'Not sent')+'</td></tr>').join("")||'<tr><td colspan="6">No C/TPA shipments published yet</td></tr>';
 }
 $("shipTenant").onchange=()=>void loadEmployers().catch(e=>show(e.message));
 $("shipContext").onchange=()=>void loadEmployers().catch(e=>show(e.message));
 $("shipEmployer").onchange=selectedEmployer;
 $("shipRefresh").onclick=()=>void loadRows().catch(e=>show(e.message));
 $("shipForm").onsubmit=async e=>{
  e.preventDefault();const b=$("shipSubmit");b.disabled=true;show("Publishing shipment…");
  try{const values=Object.fromEntries(new FormData(e.target).entries());await call("publish",values);show("Shipment published to the selected C/TPA.");e.target.elements.tracking_number.value="";await loadRows()}
  catch(err){show(err.message||"Unable to publish shipment")}
  finally{b.disabled=false}
 };
 const ws=await call("workspaces");
 $("shipTenant").innerHTML='<option value="">Select C/TPA</option>'+(ws.workspaces||[]).map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+'</option>').join("");
 await loadRows();
}catch(err){console.error("[CTPA Tracking]",err);const target=document.getElementById("tmPage");if(target)target.textContent="Unable to load C/TPA tracking: "+String(err.message||err)}
})();