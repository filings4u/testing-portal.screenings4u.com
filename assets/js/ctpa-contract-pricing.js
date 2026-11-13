(async()=>{"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=id=>document.getElementById(id);
try{
 const state=await TestingAuth.requireAuth();if(!state)return;
 TestingShell.render(state);TestingSecurity.init();
 const root=$("tmPage");let rates=[],search="";
 root.innerHTML='<div class="rate-admin"><div class="tm-page-head"><div><span class="tm-kicker">WORKFORCE / TESTING</span><h1>C/TPA Contract Pricing</h1><p>Manage the actual service rates assigned to each C/TPA. Overrides do not change default or public prices.</p></div></div><div class="rate-admin-card"><div class="rate-admin-toolbar"><label>C/TPA organization<select id="rateTenant"><option value="">Select organization</option></select></label><label>Workspace<select id="rateContext"><option value="dot">DOT</option><option value="nondot">NON-DOT</option></select></label><label>Find service<input type="search" id="rateFind" placeholder="Filter by service or code"></label><button id="rateReload" type="button">Load rates</button></div><div id="rateMessage" class="rate-admin-notice" role="status"></div></div><div class="rate-admin-card"><div class="rate-admin-scroll"><table class="rate-admin-table"><thead><tr><th>Service</th><th>Default price</th><th>C/TPA assigned price</th><th>Mode</th><th>Action</th></tr></thead><tbody id="rateRows"><tr><td colspan="5">Select a C/TPA to load service rates.</td></tr></tbody></table></div></div></div>';
 const call=(action,data={})=>TestingAuth.invoke("testing-ctpa-rate-admin",{action,...data});
 const say=x=>{$("rateMessage").textContent=x};
 const money=x=>x===null?"Not priced":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(x));
 function draw(){
  const filtered=rates.filter(r=>[r.service_name,r.service_code,r.category].join(" ").toLowerCase().includes(search.toLowerCase()));
  $("rateRows").innerHTML=filtered.length?filtered.map(r=>{
   const mode=r.override?.status||"inherit",price=mode==="published"?r.override?.price:r.default_price;
   return '<tr data-rate-row="'+esc(r.id)+'"><td><strong>'+esc(r.service_name)+'</strong><div><small>'+esc(r.category)+' · '+esc(r.service_code||"—")+'</small></div></td><td>'+money(r.default_price)+'</td><td><input aria-label="Assigned price for '+esc(r.service_name)+'" class="rate-value" type="number" min="0" max="100000" step="0.01" value="'+esc(price??"")+'"></td><td><select class="rate-mode"><option value="inherit"'+(mode==="inherit"?" selected":"")+'>Use default</option><option value="published"'+(mode==="published"?" selected":"")+'>Custom price</option><option value="hidden"'+(mode==="hidden"?" selected":"")+'>Hide service</option></select></td><td><button type="button" data-rate-save="'+esc(r.id)+'">Save rate</button></td></tr>';
  }).join(""):'<tr><td colspan="5">No matching services.</td></tr>';
  root.querySelectorAll("[data-rate-save]").forEach(b=>b.onclick=()=>void save(b));
 }
 async function load(){
  const tenant=$("rateTenant").value;if(!tenant){say("Select a C/TPA organization.");return}
  say("Loading C/TPA assigned rates…");
  try{const d=await call("list",{tenant_id:tenant,operating_context:$("rateContext").value});rates=d.rates||[];draw();say(rates.length+" rates loaded. Changes apply only to this C/TPA.")}
  catch(e){say(e.message);$("rateRows").innerHTML='<tr><td colspan="5">Rates could not be loaded.</td></tr>'}
 }
 async function save(button){
  const row=button.closest("[data-rate-row]"),mode=row.querySelector(".rate-mode").value,value=row.querySelector(".rate-value").value;
  if(mode==="published"&&(value.trim()===""||!Number.isFinite(Number(value))||Number(value)<0)){say("Enter a valid custom rate.");return}
  button.disabled=true;say("Saving contracted rate…");
  try{
   await call("set_rate",{tenant_id:$("rateTenant").value,operating_context:$("rateContext").value,rate_id:button.dataset.rateSave,status:mode,price:mode==="published"?Number(value):null});
   say("Rate saved for this C/TPA.");await load();
  }catch(e){say(e.message)}finally{button.disabled=false}
 }
 $("rateReload").onclick=()=>void load();$("rateTenant").onchange=()=>void load();$("rateContext").onchange=()=>void load();
 $("rateFind").oninput=e=>{search=e.target.value;draw()};
 const org=await call("organizations");
 $("rateTenant").innerHTML='<option value="">Select C/TPA organization</option>'+(org.organizations||[]).map(o=>'<option value="'+esc(o.id)+'">'+esc(o.name)+'</option>').join("");
 say("Select an organization to edit its contract rates.");
}catch(e){console.error("[CTPA Rate Admin]",e);const mount=document.getElementById("tmPage");if(mount)mount.textContent="Unable to load C/TPA pricing management: "+String(e.message||e)}
})();