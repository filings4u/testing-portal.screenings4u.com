(()=>{
'use strict';
async function init(){
const root=document.getElementById('tmPage');if(!root)return;
const page=document.body.dataset.labPage||'companies',params=new URLSearchParams(location.search);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toLowerCase();
const uuid=v=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v||'');
const date=v=>v?new Date(v).toLocaleDateString():'—';
const link=(url,label,cls='')=>'<a class="lab-action '+cls+'" href="'+esc(url)+'">'+esc(label)+'</a>';
const pages=[['companies','Companies','lab-companies.html'],['supplies','Supplies','lab-supplies.html'],['tracking','Tracking','lab-tracking.html'],['numbers','Account Numbers','lab-account-numbers.html'],['onboarding','Onboarding','lab-onboarding.html']];
const title=page==='tracking-form'?'Tracking Number':pages.find(x=>x[0]===page)?.[1]||'Companies';
const url=(key,id)=>pages.find(x=>x[0]===key)[2]+(id?'?intake_id='+encodeURIComponent(id):'');
const call=async(fn,body)=>{const {data,error}=await testingSupabase.functions.invoke(fn,{body});if(error){let message=error.message||'Request failed';try{const details=await error.context?.json();if(details?.error)message=details.error}catch{}throw Error(message)}if(data?.error)throw Error(data.error);return data};
const forms=body=>call('enterprise-forms-management',body);
const labs=body=>call('lab-account-management',body);
const logistics=body=>call('house-lab-fulfillment-management',body);
const head='<header class="lab-module-head"><div><div class="lab-eyebrow">WORKFORCE / TESTING MANAGEMENT / LAB ACCOUNT</div><h1>'+esc(title)+'</h1><p>'+({companies:'Manage every company that purchased a House Lab Account plan.',supplies:'Order and manage laboratory supplies for purchased accounts.',tracking:'Maintain shipping numbers, delivery statuses and customer notifications.',numbers:'Assign and edit laboratory account numbers for purchased C/TPAs.',onboarding:'Review completed intake forms and manage account activation.'}[page])+'</p></div></header>';
root.innerHTML='<div class="lab-wrap lab-module">'+head+'<nav aria-label="Lab Account module" class="lab-module-tabs">'+pages.map(([key,label,path])=>'<a href="'+path+'" class="'+(key===page?'active':'')+'">'+label+'</a>').join('')+'</nav><div id="labFeedback" role="status" aria-live="polite" class="lab-module-feedback">Loading records…</div><main id="labModuleContent"></main></div>';
const content=root.querySelector('#labModuleContent'),feedback=root.querySelector('#labFeedback');
const note=(text,bad=false)=>{feedback.textContent=text;feedback.classList.toggle('error',bad)};
const busy=(btn,on)=>{if(btn)btn.disabled=on};
const unique=rows=>[...new Map(rows.map(x=>[x.id,x])).values()];
let purchases=[],ctpas=[],orgs=[],numbers=[],shipments=[],intakes=[];
const orgFor=email=>orgs.find(x=>norm(x.primary_email)===norm(email));
const ctpaFor=p=>{const o=orgFor(p.customer_email);return o&&ctpas.find(x=>x.organization_id===o.id)};
const nameFor=p=>{const d=p.intake_data||{};return orgFor(p.customer_email)?.legal_name||d.legal_business_name||d.business_name||d.company_name||p.customer_email||'Unnamed company'};
const companyLink=p=>url('companies',p.id);
const purchasedCompanies=()=>purchases.filter((p,i)=>purchases.findIndex(x=>norm(x.customer_email)===norm(p.customer_email))===i);
const companyOptions=(selected='')=>purchasedCompanies().map(p=>'<option value="'+esc(p.id)+'" '+(p.id===selected?'selected':'')+'>'+esc(nameFor(p))+' — '+esc(p.order_number||p.customer_email)+'</option>').join('');
const stat=s=>'<span class="lab-state '+(norm(s)==='active'||norm(s)==='completed'||norm(s)==='delivered'?'good':norm(s)==='pending'||norm(s)==='submitted'?'pending':'')+'">'+esc(s||'pending')+'</span>';
const table=(headers,rows,empty)=>'<div class="lab-table-scroll"><table class="lab-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+ (rows.join('')||'<tr><td colspan="'+headers.length+'" class="lab-empty">'+esc(empty)+'</td></tr>')+'</tbody></table></div>';
const section=(heading,body,subtitle='')=>'<section class="lab-panel"><div class="lab-detail-header"><div><h2>'+heading+'</h2>'+(subtitle?'<p class="lab-muted">'+esc(subtitle)+'</p>':'')+'</div></div>'+body+'</section>';
const selectCompany=(id)=>'<label class="lab-module-select">Select company<select id="companySelect"><option value="">Choose a purchased company</option>'+companyOptions(id)+'</select></label>';
const wireSelect=(key)=>{content.querySelector('#companySelect')?.addEventListener('change',e=>location.assign(url(key,e.target.value)))};
const download=(name,html)=>{const w=window.open('','_blank');if(!w){note('Allow pop-ups to view or print the intake.',true);return}w.document.open();w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(name)+'</title><style>body{font:14px Arial;max-width:850px;margin:32px auto;color:#17355d}h1{border-bottom:3px solid #e56814;padding-bottom:14px}table{width:100%;border-collapse:collapse}td{padding:12px;border:1px solid #dce5ee;vertical-align:top}td:first-child{width:35%;font-weight:bold;background:#f2f6fb}@media print{.print{display:none}}</style></head><body><h1>Workforce — Lab Account Intake</h1>'+html+'<p class="print"><button onclick="window.print()">Print / Save as PDF</button></p></body></html>');w.document.close()};
async function loadCore(opts={}){
 const requests=[forms({action:'lab_account_purchases'})];
 if(opts.ctpa)requests.push(labs({action:'list'}));
 if(opts.logistics)requests.push(logistics({action:'list'}));
 if(opts.intakes)requests.push(forms({action:'submissions'}));
 const result=await Promise.all(requests);let n=0;
 purchases=unique((result[n++].purchases||[]).filter(p=>norm(p.status)!=='archived')).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 if(opts.ctpa){const r=result[n++];ctpas=r.ctpas||[];orgs=r.organizations||[];numbers=r.accounts||[]}
 if(opts.logistics){const r=result[n++];shipments=r.shipments||[]}
 if(opts.intakes){const r=result[n++];intakes=(r.submissions||[]).filter(x=>['lab_account_intake','lab_account_intake_standalone'].includes(x.form_key)&&norm(x.status)!=='archived')}
}
function stats(items){return '<div class="lab-stats">'+items.map(([label,n])=>'<div><strong>'+esc(n)+'</strong><span>'+esc(label)+'</span></div>').join('')+'</div>'}
function filterable(rows,keyFn,rowFn,empty,filters=''){
 content.innerHTML+=section('Management directory','<div class="lab-toolbar"><label class="lab-search-label">Search records<input type="search" id="labSearch" placeholder="Search company, email, order or account number"></label>'+filters+'</div><div id="directoryRows"></div>');
 const draw=()=>{const q=norm(content.querySelector('#labSearch')?.value);content.querySelector('#directoryRows').innerHTML=rowFn(rows.filter(x=>!q||norm(keyFn(x)).includes(q)),empty)};
 content.querySelector('#labSearch').oninput=draw;draw();
}
async function companies(){
 await loadCore({ctpa:true,logistics:true,intakes:true});
 note(purchases.length+' purchased House Lab Account plan(s)');
 content.innerHTML=stats([['Purchased companies',new Set(purchases.map(p=>norm(p.customer_email))).size],['Accounts pending',purchases.filter(p=>norm(p.account_status)!=='active').length],['Active accounts',purchases.filter(p=>norm(p.account_status)==='active').length]]);
 const id=params.get('intake_id')||'',targetCtpa=params.get('ctpa_id')||params.get('id')||'',p=purchases.find(x=>x.id===id)||purchases.find(x=>norm(x.customer_email)===norm(params.get('email')))||purchases.find(x=>ctpaFor(x)?.id===targetCtpa);
 if(!p){
  filterable(purchasedCompanies(),p=>[nameFor(p),p.customer_email,p.order_number,p.status,p.account_status].join(' '),list=>table(['Company','Latest purchase','Intake','Account','Manage'],list.map(p=>'<tr><td><strong>'+esc(nameFor(p))+'</strong><small>'+esc(p.customer_email)+'</small></td><td>'+esc(p.order_number||'—')+'<small>'+date(p.created_at)+'</small></td><td>'+stat(p.status)+'</td><td>'+stat(p.account_status)+'</td><td>'+link(companyLink(p),'Manage company','lab-primary')+'</td></tr>'),'No House Lab Account purchases found.'),'');
  return;
 }
 const c=ctpaFor(p),org=orgFor(p.customer_email),same=purchases.filter(x=>norm(x.customer_email)===norm(p.customer_email)),count=numbers.filter(x=>x.ctpa_id===c?.id).length;
 content.innerHTML+=section('Company management','<div class="lab-company-identity"><div><h3>'+esc(nameFor(p))+'</h3><p>'+esc(p.customer_email)+'</p><p>Purchased '+date(p.created_at)+' · Order '+esc(p.order_number||'—')+'</p></div><div>'+stat(p.account_status)+'</div></div><div class="lab-quick-actions">'+link(url('onboarding',p.id),'View intake')+link(url('numbers',p.id),'Manage account numbers')+link(url('supplies',p.id),'Order supplies')+link(url('tracking',p.id),'Manage tracking')+'</div><div class="lab-detail"><div class="lab-detail-field"><span>Business</span><strong>'+esc(org?.legal_name||nameFor(p))+'</strong></div><div class="lab-detail-field"><span>C/TPA profile</span><strong>'+esc(c?.company_code||'Not yet linked')+'</strong></div><div class="lab-detail-field"><span>Intake status</span><strong>'+esc(p.status||'pending')+'</strong></div><div class="lab-detail-field"><span>Assigned lab numbers</span><strong>'+count+'</strong></div><div class="lab-detail-field"><span>Purchases for this email</span><strong>'+same.length+'</strong></div></div>'+(c?'<div class="lab-quick-actions">'+'<span class="lab-muted">Edit business details below</span>'+'</div>':''),'All company actions are accessible here. Each operation has its own management page.');
 if(c){
  const customer=await labs({action:'get_ctpa_profile',ctpa_id:c.id}),profile=customer.organization||{},support=customer.ctpa||{};
  const profileFields=[['legal_name','Legal business name',profile.legal_name],['dba_name','DBA / trade name',profile.dba_name],['phone','Company phone',profile.phone],['website','Website',profile.website],['address_line1','Street',profile.address_line1],['address_line2','Suite',profile.address_line2],['city','City',profile.city],['state_region','State',profile.state_region],['postal_code','ZIP',profile.postal_code],['support_email','Support email',support.support_email],['support_phone','Support phone',support.support_phone]];
  content.innerHTML+=section('Edit company profile','<form class="lab-edit-grid" id="companyEditForm">'+profileFields.map(([key,label,value])=>'<label>'+esc(label)+'<input name="'+key+'" maxlength="250" value="'+esc(value||'')+'" '+(key==='legal_name'?'required':'')+'></label>').join('')+'<div class="lab-form-actions"><button class="lab-primary" type="submit">Save company changes</button></div></form><p id="companySaveNotice" role="status"></p>','Update the existing C/TPA business record. The customer identity email is managed separately to avoid duplicate accounts.');
 }
 if(!c){content.innerHTML+=section('Connect company C/TPA','<p class="lab-muted">A purchased company must be linked to a C/TPA profile before laboratory account numbers can be assigned.</p><div class="lab-form-actions"><button id="linkCompanyCtpa" class="lab-primary" type="button">Create / link C/TPA profile</button></div><p id="linkCtpaNotice" role="status"></p>');}
 content.innerHTML+=section('Related purchases',table(['Order','Intake','Account','Manage'],same.map(x=>'<tr><td>'+esc(x.order_number)+'</td><td>'+stat(x.status)+'</td><td>'+stat(x.account_status)+'</td><td>'+link(companyLink(x),'Manage')+'</td></tr>'),'No additional purchases.'));
 if(!c){content.querySelector('#linkCompanyCtpa').onclick=async e=>{const button=e.currentTarget;busy(button,true);try{await call('house-lab-ctpa-provision',{action:'provision',intake_id:p.id});location.assign(companyLink(p))}catch(error){content.querySelector('#linkCtpaNotice').textContent=error.message;busy(button,false)}}}
 if(c){const profileForm=content.querySelector('#companyEditForm');profileForm.onsubmit=async e=>{e.preventDefault();const button=profileForm.querySelector('[type=submit]');busy(button,true);try{await labs({action:'update_ctpa_profile',ctpa_id:c.id,...Object.fromEntries(new FormData(profileForm).entries())});content.querySelector('#companySaveNotice').textContent='Company profile saved.';busy(button,false)}catch(error){content.querySelector('#companySaveNotice').textContent=error.message;busy(button,false)}}}

}
async function suppliesPage(){
 await loadCore({logistics:true,ctpa:true});
 note(purchases.length+' purchased accounts · '+shipments.length+' supply records');
 content.innerHTML=stats([['Purchased accounts',purchases.length],['Supply orders',shipments.length],['Preparing / ordered',shipments.filter(x=>['preparing','ordered'].includes(norm(x.status))).length]]);
 const p=purchases.find(x=>x.id===params.get('intake_id'));
 content.innerHTML+=section('Customer-submitted supply requests',link('https://app.screenings4u.com/ic-supply-management.html','Review customer supply requests','primary')+'<p class="lab-muted">Supply orders submitted directly in the Lab Account customer portal are managed in Supply Requests. Use this link to review products, quantities, and fulfillment.</p>');
 content.innerHTML+=section('Supply order management',selectCompany(p?.id||'')+'<p class="lab-muted">Select a purchased company to create or manage its supply orders. Shipping tracking is managed on the separate Tracking page.</p>');
 wireSelect('supplies');
 if(!p){content.innerHTML+=section('All supply orders',table(['Company','Supplies','Status','Created','Manage'],shipments.map(x=>{const p=purchases.find(p=>p.id===x.intake_id);return '<tr><td>'+esc(p?nameFor(p):'Unknown')+'</td><td>'+esc(x.items_description||'Supplies')+'</td><td>'+stat(x.status)+'</td><td>'+date(x.created_at)+'</td><td>'+link(url('supplies',x.intake_id),'Manage supplies')+'</td></tr>'}),'No supply orders yet.'));wireSelect('supplies');return}
 const assigned=shipments.filter(x=>x.intake_id===p.id),edit=assigned.find(x=>x.id===params.get('shipment_id'));
 content.innerHTML+=section('Create or edit supply order','<form id="supplyForm" class="lab-edit-grid"><label>Supply items / quantities<textarea name="items_description" maxlength="2000" required rows="3" placeholder="e.g. 2 boxes collection cups, 1 packet chain-of-custody forms">'+esc(edit?.items_description||'')+'</textarea></label><label>Supplier or carrier<input name="carrier" maxlength="80" value="'+esc(edit?.carrier||'')+'" placeholder="Supplier or preferred carrier"></label><label>Order status<select name="status"><option value="preparing" '+(!edit||edit.status==='preparing'?'selected':'')+'>Preparing</option><option value="ordered" '+(edit?.status==='ordered'?'selected':'')+'>Ordered</option><option value="cancelled" '+(edit?.status==='cancelled'?'selected':'')+'>Cancelled</option>'+(edit&&['shipped','delivered'].includes(edit.status)?'<option value="'+esc(edit.status)+'" selected>'+esc(edit.status)+'</option>':'')+'</select></label><label>Internal notes<textarea name="notes" rows="3" maxlength="2000">'+esc(edit?.notes||'')+'</textarea></label><div class="lab-form-actions"><button type="submit" class="lab-primary">Save supply order</button>'+link(url('supplies',p.id),'New order')+'</div></form><p role="status" id="supplyNotice"></p>','Supply orders are maintained here; tracking and customer shipping emails are managed on Tracking.');
 content.innerHTML+=section('Supply order history',table(['Items','Order status','Date','Manage'],assigned.map(x=>'<tr><td>'+esc(x.items_description||'Supplies')+'</td><td>'+stat(x.status)+'</td><td>'+date(x.created_at)+'</td><td>'+link(url('supplies',p.id)+'&shipment_id='+encodeURIComponent(x.id),'Edit order')+' '+link('lab-tracking-number.html?shipment_id='+encodeURIComponent(x.id),'Tracking')+'</td></tr>'),'No supply orders for this company.'));
 wireSelect('supplies');const form=content.querySelector('#supplyForm');form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('[type=submit]');busy(btn,true);try{const v=Object.fromEntries(new FormData(form).entries());await logistics({action:'save_shipment',intake_id:p.id,id:edit?.id||null,items_description:v.items_description,carrier:v.carrier||'Other',status:v.status,notes:v.notes||'',tracking_number:edit?.tracking_number||'',tracking_url:edit?.tracking_url||''});location.assign(url('supplies',p.id))}catch(error){content.querySelector('#supplyNotice').textContent=error.message;busy(btn,false)}};
}
async function trackingPage(){
 await loadCore({logistics:true,ctpa:true});
 note(shipments.length+' tracking record'+(shipments.length===1?'':'s'));
 // Show the actual email result from the preceding save after returning to the register.
 try{
  const raw=sessionStorage.getItem('s4u_lab_tracking_save_feedback');
  if(raw){
   sessionStorage.removeItem('s4u_lab_tracking_save_feedback');
   const saved=JSON.parse(raw);
   const feedback=root.querySelector('#labFeedback');
   if(saved.email_status==='sent'){
    feedback.textContent='Tracking '+saved.tracking_number+' saved. Branded tracking email sent to '+saved.customer_email+'.';
    feedback.classList.add('lab-feedback-success');
   }else if(saved.email_status==='failed'||saved.email_status==='email_not_configured'){
    feedback.textContent='Tracking '+saved.tracking_number+' saved, but the customer email was not sent. Check notification delivery before proceeding.';
    feedback.classList.add('error');
   }else{
    feedback.textContent='Tracking '+saved.tracking_number+' saved. No new email was required or confirmed for this update.';
    feedback.classList.add('lab-feedback-success');
   }
  }
 }catch(error){console.warn('Tracking save feedback unavailable',error)}
 const trackingRow=x=>{
  const customer=purchases.find(p=>p.id===x.intake_id);
  return '<tr><td><strong>'+esc(x.tracking_number||'Not assigned')+'</strong><small>'+esc(x.items_description||'Package')+'</small></td><td><strong>'+esc(customer?nameFor(customer):'Unknown company')+'</strong><small>'+esc(customer?.customer_email||'')+'</small></td><td>'+esc(x.carrier||'—')+'</td><td>'+stat(x.status)+'</td><td>'+date(x.created_at)+'</td><td>'+(x.notification_sent_at?'Sent '+date(x.notification_sent_at):'Not sent')+'</td><td><div class="lab-row-actions">'+link('lab-tracking-number.html?shipment_id='+encodeURIComponent(x.id),'Edit')+(x.tracking_url?link(x.tracking_url,'Track package'):'')+'</div></td></tr>';
 };
 content.innerHTML=section('Tracking Number Management',
  '<div class="lab-tracking-toolbar lab-tracking-toolbar-simple"><label>Search tracking numbers<input id="trackingSearch" type="search" placeholder="Search tracking number, company, carrier or package"></label><div class="lab-tracking-create">'+link('lab-tracking-number.html','+ New Tracking Number','lab-primary')+'</div></div>'+
  '<div class="lab-tracking-register" id="trackingRegister"></div>',
  'Search and manage all tracking numbers.');
 const search=content.querySelector('#trackingSearch'),register=content.querySelector('#trackingRegister');
 const draw=()=>{const q=norm(search.value),rows=shipments.filter(x=>{const p=purchases.find(p=>p.id===x.intake_id);return !q||[x.tracking_number,x.carrier,x.items_description,x.status,p?.customer_email,p?nameFor(p):''].some(v=>norm(v).includes(q))});
  register.innerHTML=table(['Tracking number / package','Company / C/TPA','Carrier','Status','Created','Notification','Actions'],rows.map(trackingRow),'No tracking numbers match your search.');
 };
 search.oninput=draw;draw();
}
async function trackingFormPage(){
 await loadCore({logistics:true,ctpa:true});
 const companies=purchasedCompanies(),editing=shipments.find(x=>x.id===params.get('shipment_id'));
 const currentPurchase=editing?purchases.find(x=>x.id===editing.intake_id):purchases.find(x=>x.id===params.get('intake_id'));
 const currentCompany=currentPurchase&&companies.find(x=>norm(x.customer_email)===norm(currentPurchase.customer_email));
 const ordersFor=p=>purchases.filter(x=>norm(x.customer_email)===norm(p.customer_email));
 const currentLabel=editing?'Edit Tracking Number':'New Tracking Number';
 root.querySelector('.lab-module-head h1').textContent=currentLabel;
 root.querySelector('.lab-module-head p').textContent='Select a purchased C/TPA and manage an individual shipment tracking number.';
 note(editing?'Editing an existing tracking record.':'Create a new tracking record for any purchased C/TPA.');
 if(params.get('shipment_id')&&!editing){note('Tracking record not found.',true);content.innerHTML=section('Tracking not found',link('lab-tracking.html','Back to tracking register'));return}
 const companyOptions=companies.map(p=>'<option value="'+esc(p.id)+'" '+(currentCompany&&norm(p.customer_email)===norm(currentCompany.customer_email)?'selected':'')+'>'+esc(nameFor(p))+' — '+esc(p.customer_email)+'</option>').join('');
 content.innerHTML='<div class="lab-detail-nav">'+link('lab-tracking.html','← All tracking numbers')+'</div>'+
 section(currentLabel,
 '<form id="trackingEntryForm" class="lab-edit-grid">'+
 '<label>Company / C/TPA<select name="company" id="trackingCompany" required '+(editing?'disabled':'')+'><option value="">Select a company / C/TPA</option>'+companyOptions+'</select></label>'+
 '<label>House Lab Account purchase<select name="intake_id" id="trackingPurchase" required><option value="">Select a company first</option></select></label>'+
 '<label>Carrier<select name="carrier_choice">'+['FedEx','UPS','USPS','DHL','OnTrac','Other'].map(x=>'<option value="'+x+'" '+(norm(editing?.carrier)===norm(x)?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
 '<label>Carrier name (if Other)<input name="other_carrier" maxlength="80" value="'+esc(editing?.carrier&&!['fedex','ups','usps','dhl','ontrac'].includes(norm(editing.carrier))?editing.carrier:'')+'"></label>'+
 '<label>Tracking number<input required name="tracking_number" maxlength="160" value="'+esc(editing?.tracking_number||'')+'" placeholder="Enter carrier tracking number"></label>'+
 '<label>Tracking URL (HTTPS)<input name="tracking_url" type="url" maxlength="1000" value="'+esc(editing?.tracking_url||'')+'" placeholder="https://carrier.example/track/..."></label>'+
 '<label>Package / contents<input name="items_description" maxlength="2000" value="'+esc(editing?.items_description||'')+'" placeholder="Package contents"></label>'+
 '<label>Shipping status<select name="status">'+['preparing','ordered','shipped','delivered','cancelled'].map(x=>'<option value="'+x+'" '+(x===(editing?.status||'ordered')?'selected':'')+'>'+x.replaceAll('_',' ')+'</option>').join('')+'</select></label>'+
 '<label>Internal tracking notes<textarea name="notes" rows="3" maxlength="2000">'+esc(editing?.notes||'')+'</textarea></label>'+
 '<div class="lab-form-actions"><button type="submit" class="lab-primary">'+(editing?'Save Tracking Changes':'Create Tracking Number')+'</button>'+link('lab-tracking.html','Cancel')+'</div></form>'+
 '<p id="trackingNotice" role="status"></p><p class="lab-muted">Each save creates or edits one independent tracking record. The existing branded notification workflow applies when a record is marked Shipped.</p>',
 'Add multiple tracking numbers to a C/TPA by creating a separate record for each package.');
 const form=content.querySelector('#trackingEntryForm'),company=form.querySelector('#trackingCompany'),purchase=form.querySelector('#trackingPurchase'),out=content.querySelector('#trackingNotice');
 function setOrders(){
  const p=companies.find(x=>x.id===company.value),orders=p?ordersFor(p):[];
  purchase.innerHTML='<option value="">Select a purchase</option>'+orders.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===currentPurchase?.id?'selected':'')+'>'+esc(x.order_number||x.id)+'</option>').join('');
  if(editing)purchase.disabled=true;
 }
 company.onchange=()=>{setOrders();out.textContent=''};setOrders();
 form.onsubmit=async e=>{
  e.preventDefault();
  const btn=form.querySelector('[type=submit]'),v=Object.fromEntries(new FormData(form).entries()),carrier=v.carrier_choice==='Other'?String(v.other_carrier||'').trim():v.carrier_choice;
  const intakeId=editing?.intake_id||v.intake_id;
  if(!company.value||!intakeId){out.textContent='Select a company and a House Lab Account purchase.';return}
  if(!carrier){out.textContent='Enter a carrier name.';return}
  if(v.status==='shipped'&&(!v.tracking_number.trim()||!v.tracking_url.trim())){out.textContent='Shipped records require a tracking number and HTTPS URL.';return}
  if(shipments.some(x=>x.id!==editing?.id&&x.intake_id===intakeId&&norm(x.carrier)===norm(carrier)&&norm(x.tracking_number)===norm(v.tracking_number))){out.textContent='This tracking number already exists for this carrier and purchase. Edit its record instead.';return}
  busy(btn,true);out.textContent='Saving tracking number…';
  try{const saved=await logistics({action:'save_shipment',intake_id:intakeId,id:editing?.id||null,carrier,tracking_number:v.tracking_number.trim(),tracking_url:v.tracking_url.trim(),items_description:v.items_description.trim(),status:v.status,notes:v.notes.trim()});const customer=companies.find(p=>p.id===company.value);sessionStorage.setItem('s4u_lab_tracking_save_feedback',JSON.stringify({tracking_number:v.tracking_number.trim(),customer_email:customer?.customer_email||'',email_status:saved.email_status||'not_required'}));location.assign('lab-tracking.html')}
  catch(error){out.textContent=error.message;busy(btn,false)}
 };
}
async function numbersPage(){
 await loadCore({ctpa:true});
 const eligible=purchasedCompanies().map(p=>({...p,ctpa:ctpaFor(p)}));
 note(purchases.length+' purchased company accounts · '+numbers.length+' laboratory account numbers');
 content.innerHTML=stats([['Purchased companies',new Set(purchases.map(p=>norm(p.customer_email))).size],['Linked C/TPAs',new Set(eligible.map(x=>x.ctpa?.id).filter(Boolean)).size],['Assigned lab numbers',numbers.filter(x=>eligible.some(e=>e.ctpa?.id===x.ctpa_id)).length]]);
 const p=purchases.find(x=>x.id===params.get('intake_id'))||purchases.find(x=>ctpaFor(x)?.id===params.get('ctpa_id'))||purchases.find(x=>ctpaFor(x)?.id===numbers.find(a=>a.id===params.get('id'))?.ctpa_id);
 if(!p){filterable(eligible,x=>[nameFor(x),x.customer_email,x.order_number,x.ctpa?.company_code,...numbers.filter(n=>n.ctpa_id===x.ctpa?.id).map(n=>n.account_code)].join(' '),list=>table(['Purchased company','C/TPA','Assigned numbers','Manage'],list.map(x=>'<tr><td><strong>'+esc(nameFor(x))+'</strong><small>'+esc(x.customer_email)+'</small></td><td>'+esc(x.ctpa?.company_code||'Not linked')+'</td><td>'+numbers.filter(n=>n.ctpa_id===x.ctpa?.id).length+'</td><td>'+link(url('numbers',x.id),'Manage lab numbers','lab-primary')+'</td></tr>'),'No purchased accounts.'));return}
 const ctpa=ctpaFor(p),assigned=numbers.filter(n=>n.ctpa_id===ctpa?.id),edit=assigned.find(x=>x.id===(params.get('number_id')||params.get('id')));
 content.innerHTML+=section('Laboratory account numbers',selectCompany(p.id)+'<p class="lab-muted">Unlimited laboratory account numbers may be assigned to each linked C/TPA. Edit the existing row rather than creating duplicate assignments.</p>');wireSelect('numbers');
 if(!ctpa){content.innerHTML+=section('C/TPA setup required','<p>This purchased company has not yet been linked to a C/TPA profile. Complete its onboarding before assigning numbers.</p>'+link(url('onboarding',p.id),'Open onboarding','lab-primary'));wireSelect('numbers');return}
 const types=['dot','non_dot','hair','oral','other'];
 content.innerHTML+=section(edit?'Edit lab account number':'Add lab account number','<form id="numberForm" class="lab-edit-grid"><label>Laboratory<input name="lab_name" required maxlength="180" value="'+esc(edit?.lab_name||'')+'" placeholder="Labcorp, Quest, CRL…"></label><label>Account type<select name="account_type">'+types.map(t=>'<option value="'+t+'" '+((edit?.config?.account_type||'dot')===t?'selected':'')+'>'+t.replaceAll('_',' ').toUpperCase()+'</option>').join('')+'</select></label><label>Account number<input name="account_code" required maxlength="120" value="'+esc(edit?.account_code||'')+'"></label><label>Status<select name="status"><option value="active" '+(edit?.status!=='inactive'?'selected':'')+'>Active</option><option value="inactive" '+(edit?.status==='inactive'?'selected':'')+'>Inactive</option></select></label><label>Primary<select name="is_primary"><option value="false" '+(!edit?.is_primary?'selected':'')+'>No</option><option value="true" '+(edit?.is_primary?'selected':'')+'>Yes</option></select></label><label>Notes<input name="notes" maxlength="2000" value="'+esc(edit?.notes||'')+'"></label><div class="lab-form-actions"><button type="submit" class="lab-primary">'+(edit?'Update account number':'Add account number')+'</button>'+link(url('numbers',p.id),'Clear form')+'</div></form><p id="numberNotice" role="status"></p>');
 content.innerHTML+=section('Assigned account numbers',table(['Laboratory','Type','Account number','Status','Primary','Manage'],assigned.map(a=>'<tr><td>'+esc(a.lab_name)+'</td><td>'+esc(a.config?.account_type||'dot')+'</td><td>'+esc(a.account_code)+'</td><td>'+stat(a.status)+'</td><td>'+(a.is_primary?'Yes':'No')+'</td><td>'+link(url('numbers',p.id)+'&number_id='+encodeURIComponent(a.id),'Edit')+'</td></tr>'),'No numbers assigned for this company.'));
 wireSelect('numbers');const form=content.querySelector('#numberForm');form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('[type=submit]');busy(btn,true);try{const v=Object.fromEntries(new FormData(form).entries());await labs({action:'save',ctpa_id:ctpa.id,id:edit?.id||null,...v,is_primary:v.is_primary==='true'});location.assign(url('numbers',p.id))}catch(error){content.querySelector('#numberNotice').textContent=error.message;busy(btn,false)}};
}
async function onboardingPage(){
 await loadCore({intakes:true});
 const completed=intakes.filter(x=>norm(x.status)==='completed'),total=intakes.length;
 note(total+' submitted intake form(s) · '+completed.length+' reviewed');
 content.innerHTML=stats([['Intakes received',total],['Review completed',completed.length],['Awaiting review',total-completed.length]]);
 const id=params.get('intake_id'),standalone=intakes.find(x=>x.id===params.get('submission_id')),p=purchases.find(x=>x.id===id)||purchases.find(x=>norm(x.customer_email)===norm(params.get('email')))||purchases.find(x=>norm(x.customer_email)===norm(standalone?.submitter_email));
 const matched=p?intakes.filter(x=>norm(x.submitter_email)===norm(p.customer_email)):[];
 if(!p&&standalone){
  const full=await forms({action:'get_submission',id:standalone.id}).catch(()=>({files:[]}));
  const attachments=(full.files||[]).map(x=>x.url?link(x.url,x.file_name||x.original_name||'View attachment'):'<span class="lab-muted">'+esc(x.file_name||'Attachment unavailable')+'</span>').join(' ');
  const fields=Object.entries(standalone.payload||{}).filter(([k,v])=>v!==null&&v!==undefined&&!/captcha|token|password|secret|trap|signature/i.test(k)).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)]);
  const rows=fields.map(([k,v])=>'<tr><td>'+esc(k.replaceAll('_',' '))+'</td><td>'+esc(v||'—')+'</td></tr>');
  content.innerHTML+=section('Submitted intake — '+esc(standalone.submitter_email||'No customer email'),'<div class="lab-quick-actions"><button id="printUnlinkedIntake" type="button">View / Download PDF</button></div>'+table(['Field','Answer'],rows,'No form details available.')+(attachments?'<div class="lab-quick-actions"><strong>Attached files:</strong> '+attachments+'</div>':'')+'<p class="lab-muted">The intake has no matching House Lab Account purchase. It remains visible for management review; company activation requires a linked purchased account.</p>');
  content.querySelector('#printUnlinkedIntake').onclick=()=>download('House Lab Intake',table(['Field','Answer'],rows,'No form details available.'));
  return;
 }
 if(!p){
  filterable(intakes,x=>[x.submitter_email,x.submitter_name,x.submission_number,x.status,x.payload?.legal_business_name].join(' '),rows=>table(['Company / submitter','Submitted','Review status','Purchase','Manage'],rows.map(x=>{const p=purchases.find(p=>norm(p.customer_email)===norm(x.submitter_email));return '<tr><td><strong>'+esc(x.payload?.legal_business_name||x.submitter_name||x.submitter_email||'Customer')+'</strong><small>'+esc(x.submitter_email||'—')+'</small></td><td>'+date(x.submitted_at||x.created_at)+'</td><td>'+stat(x.status)+'</td><td>'+esc(p?.order_number||'Not linked')+'</td><td>'+ (p?link(url('onboarding',p.id),'Manage intake','lab-primary'):link('lab-onboarding.html?submission_id='+encodeURIComponent(x.id),'View intake'))+'</td></tr>'}),'No completed House Lab Account intake submissions found.'));
  return;
 }
 const selected=matched.find(x=>x.id===params.get('submission_id'))||matched[0];
 content.innerHTML+=section('Onboarding management',selectCompany(p.id)+'<div class="lab-company-identity"><div><h3>'+esc(nameFor(p))+'</h3><p>'+esc(p.customer_email)+'</p></div><div>'+stat(p.account_status)+'</div></div><div class="lab-quick-actions">'+link(companyLink(p),'Company management')+link(url('numbers',p.id),'Account numbers')+'</div>');wireSelect('onboarding');
 if(!selected){content.innerHTML+=section('Intake not submitted','<p>This company purchased a House Lab Account but has not completed a linked intake form yet.</p><p>Activation requires a completed intake review.</p>');wireSelect('onboarding');return}
 const full=await forms({action:'get_submission',id:selected.id}).catch(()=>({files:[]}));
 const attachments=(full.files||[]).map(x=>x.url?link(x.url,x.file_name||x.original_name||'View attachment'):'<span class="lab-muted">'+esc(x.file_name||'Attachment unavailable')+'</span>').join(' ');
 const fields=Object.entries(selected.payload||{}).filter(([k,v])=>v!==null&&v!==undefined&&!/captcha|token|password|secret|trap|signature/i.test(k)).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)]);
 const formTable=table(['Form field','Submitted answer'],fields.map(([k,v])=>'<tr><td>'+esc(k.replaceAll('_',' '))+'</td><td>'+esc(v||'—')+'</td></tr>'),'No form fields available.');
 content.innerHTML+=section('Submitted intake form','<div class="lab-quick-actions"><button type="button" id="printIntake">View / Download PDF</button>'+'</div><div class="lab-muted">Submitted '+date(selected.submitted_at||selected.created_at)+' · '+esc(selected.submission_number||selected.id)+'</div>'+formTable+(attachments?'<div class="lab-quick-actions"><strong>Attached files:</strong> '+attachments+'</div>':''));
 content.innerHTML+=section('Review and account status','<div class="lab-edit-grid"><label>Intake review status<select id="reviewStatus"><option value="submitted" '+(selected.status==='submitted'?'selected':'')+'>Submitted</option><option value="reviewing" '+(selected.status==='reviewing'?'selected':'')+'>Reviewing</option><option value="completed" '+(selected.status==='completed'?'selected':'')+'>Completed</option></select></label><label>Account status<select id="accountStatus"><option value="pending" '+(norm(p.account_status)!=='active'?'selected':'')+'>Pending</option><option value="active" '+(norm(p.account_status)==='active'?'selected':'')+'>Active</option></select></label></div><div class="lab-form-actions"><button type="button" class="lab-primary" id="saveReview">Save intake review</button><button type="button" id="saveActivation">Save Pending / Active status</button></div><p id="reviewNotice" role="status"></p><p class="lab-muted">Active status requires all existing approval checks to pass; the UI cannot bypass those checks.</p>');
 const formMarkup='<p><strong>'+esc(nameFor(p))+'</strong> · '+esc(p.customer_email)+'</p><table>'+fields.map(([k,v])=>'<tr><td>'+esc(k.replaceAll('_',' '))+'</td><td>'+esc(v||'—')+'</td></tr>').join('')+'</table>';
 wireSelect('onboarding');content.querySelector('#printIntake').onclick=()=>download('House Lab Intake — '+nameFor(p),formMarkup);
 content.querySelector('#saveReview').onclick=async e=>{busy(e.currentTarget,true);try{await forms({action:'update_submission',id:selected.id,status:content.querySelector('#reviewStatus').value});location.assign(url('onboarding',p.id))}catch(error){content.querySelector('#reviewNotice').textContent=error.message;busy(e.currentTarget,false)}};
 content.querySelector('#saveActivation').onclick=async e=>{busy(e.currentTarget,true);try{await forms({action:'set_lab_account_status',id:p.id,account_status:content.querySelector('#accountStatus').value});location.assign(url('onboarding',p.id))}catch(error){content.querySelector('#reviewNotice').textContent=error.message;busy(e.currentTarget,false)}};
}
try{if(page==='companies')await companies();else if(page==='supplies')await suppliesPage();else if(page==='tracking')await trackingPage();else if(page==='tracking-form')await trackingFormPage();else if(page==='numbers')await numbersPage();else if(page==='onboarding')await onboardingPage();else throw Error('Unknown lab module page')}catch(error){note(error.message,true);content.innerHTML='<section class="lab-panel"><h2>Could not load lab management</h2><p>'+esc(error.message)+'</p><button type="button" class="lab-action" id="labRetry">Retry</button></section>';content.querySelector('#labRetry').onclick=()=>location.reload()}
}
window.TestingLab=Object.freeze({init});
})();