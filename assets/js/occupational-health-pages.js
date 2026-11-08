(()=>{'use strict';
const $=s=>document.querySelector(s),esc=v=>window.TestingShell.esc(v);
const format=v=>v?new Date(v).toLocaleString():'—';
const api=(action,extra={})=>window.TestingAuth.invoke(window.TESTING_PORTAL_CONFIG.operationsFunction,{action,...extra});
const notify=async message=>window.TestingDialogs?.alert?window.TestingDialogs.alert(message):alert(message);
let current=[],options={};
function field(label,name,value='',type='text'){return '<label class="tm-field"><span>'+esc(label)+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value||'')+'"></label>'}
function select(label,name,opts,selected){return '<label class="tm-field"><span>'+esc(label)+'</span><select name="'+name+'">'+opts.map(([id,text])=>'<option value="'+esc(id)+'"'+(id===selected?' selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label>'}
function editForm(record){
 return '<section class="tm-card" style="margin:20px 0"><div class="tm-card-head"><div><h2>'+ (record?'Edit Physical '+esc(record.reference_number):'Create Physical')+'</h2><p>Use linked customer or employer IDs when applicable. No unverified account assignment is allowed.</p></div></div><div class="tm-card-body"><form id="ohForm" class="tm-builder-form">'+
 (record?'':select('Receiving portal','recipient_portal',[['customer','Regular Customer'],['ctpa','C/TPA'],['employer','Direct Employer'],['owner_operator','Owner-Operator']],'customer'))+
 (record?'':select('Physical type','physical_type',[['DOT','DOT Physical'],['NON_DOT','Non-DOT Physical']],'DOT'))+
 select('Exam type','exam_type',[['physical','Standard Physical'],['recertification','Recertification'],['return_to_duty','Return to Duty'],['fit_for_duty','Fit for Duty'],['pre_employment','Pre-Employment']],record?.exam_type||'physical')+
 (record?'':select('Customer account','customer_user_id',[['','Choose customer'],...(options.customers||[]).map(x=>[x.id,x.display_name||[x.first_name,x.last_name].filter(Boolean).join(' ')||x.email])],''))+
 (record?'':select('Employer','employer_id',[['','Choose employer'],...(options.employers||[]).map(x=>[x.id,x.legal_name])],''))+
 (record?'':select('Employer Employee','employee_id',[['','Choose employee'],...(options.employees||[]).map(x=>[x.id,[x.first_name,x.last_name].filter(Boolean).join(' ')+' — '+((options.employers||[]).find(e=>e.id===x.employer_id)?.legal_name||'')])],''))+
 (record?'':field('Donor name','donor_name',''))+
 field('Donor email','donor_email',record?.donor_email||'','email')+
 field('Donor phone','donor_phone',record?.donor_phone||'')+
 '<label class="tm-field wide"><span>Internal notes</span><textarea name="notes" rows="3">'+esc(record?.notes||'')+'</textarea></label>'+
 '<div class="wide tm-actions"><button class="tm-btn primary" type="submit">Save Physical</button><button class="tm-btn" type="button" id="ohCancel">Cancel</button></div><div id="ohError" class="wide" role="alert" style="color:#a22626"></div></form></div></section>';
}
function renderRows(){
 const rows=current.map(x=>{
 const pass=x.donor_pass;
 const actions='<a class="tm-btn" href="'+(x.testing_case_id?'testing-case.html?id='+encodeURIComponent(x.testing_case_id):'#')+'">'+(x.testing_case_id?'View Case':'Draft')+'</a> '+(x.status!=='delivered'?'<button class="tm-btn" data-edit="'+esc(x.id)+'">Edit</button> ':'')+(x.status==='draft'?'<button class="tm-btn primary" data-submit="'+esc(x.id)+'">Submit</button> ':'')+(x.testing_case_id?'<a class="tm-btn primary" href="testing-donor-pass.html?id='+encodeURIComponent(x.testing_case_id)+'">'+(x.donor_pass_id?'View Pass':'Issue Donor Pass')+'</a> ':'')+(x.donor_pass_id&&x.recipient_portal==='owner_operator'&&x.status!=='delivered'?'<button class="tm-btn primary" data-deliver="'+esc(x.id)+'">Push to Owner-Operator</button> ':'')+'<button class="tm-btn danger" data-archive="'+esc(x.id)+'">Delete</button>';
 return '<tr><td><strong>'+esc(x.reference_number)+'</strong><small>'+format(x.created_at)+'</small></td><td>'+esc(x.donor_name)+'</td><td>'+esc(x.company_name||'Regular customer')+'</td><td>'+esc(x.physical_type)+' / '+esc(x.exam_type.replaceAll('_',' '))+'</td><td>'+esc(x.recipient_portal)+'</td><td>'+esc(x.status)+'</td><td>'+esc(pass?.pass_number||'—')+'</td><td><div class="tm-actions">'+actions+'</div></td></tr>';
 }).join('');
 $('#ohRows').innerHTML=rows||'<tr><td colspan="8">No physical orders yet.</td></tr>';
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>showForm(current.find(x=>x.id===b.dataset.edit)));
 document.querySelectorAll('[data-submit]').forEach(b=>b.onclick=async()=>{if(!await window.TestingDialogs.confirm('Submit this physical to Testing Management?'))return;b.disabled=true;try{await api('occupational_submit',{physical_id:b.dataset.submit});await init()}catch(e){await notify(e.message||String(e));b.disabled=false}});
 document.querySelectorAll('[data-deliver]').forEach(b=>b.onclick=async()=>{if(!await window.TestingDialogs.confirm('Deliver this issued physical donor pass to the linked Owner-Operator portal?'))return;b.disabled=true;try{await api('occupational_deliver',{physical_id:b.dataset.deliver});await init()}catch(e){await notify(e.message||String(e));b.disabled=false}});
 document.querySelectorAll('[data-archive]').forEach(b=>b.onclick=async()=>{if(!await window.TestingDialogs.confirm('Archive this physical? This retains the audit trail and will not delete an issued donor pass.',{danger:true}))return;b.disabled=true;try{await api('occupational_archive',{physical_id:b.dataset.archive});await init()}catch(e){await notify(e.message||String(e));b.disabled=false}});
}
function showForm(record){
 $('#ohEditor').innerHTML=editForm(record);$('#ohEditor').scrollIntoView({behavior:'smooth'});
 $('#ohCancel').onclick=()=>$('#ohEditor').innerHTML='';
 const employerSelect=$('#ohForm [name=employer_id]'),employeeSelect=$('#ohForm [name=employee_id]'),recipientSelect=$('#ohForm [name=recipient_portal]');
 if(employerSelect&&employeeSelect){
   const filterWorkers=()=>{const value=employerSelect.value;employeeSelect.innerHTML='<option value="">Choose employee</option>'+(options.employees||[]).filter(e=>e.employer_id===value).map(x=>'<option value="'+esc(x.id)+'">'+esc([x.first_name,x.last_name].filter(Boolean).join(' '))+'</option>').join('');};
   employerSelect.onchange=filterWorkers;filterWorkers();
 }
 if(recipientSelect){
   const updateHints=()=>{const target=recipientSelect.value,customer=$('#ohForm [name=customer_user_id]'),emp=$('#ohForm [name=employer_id]'),worker=$('#ohForm [name=employee_id]');if(!customer||!emp||!worker)return;customer.closest('label').hidden=target!=='customer';emp.closest('label').hidden=target==='customer';worker.closest('label').hidden=target==='customer';};
   recipientSelect.onchange=updateHints;updateHints();
 }
 $('#ohForm').onsubmit=async e=>{
  e.preventDefault();const button=$('#ohForm button[type=submit]'),data=Object.fromEntries(new FormData($('#ohForm')).entries());button.disabled=true;$('#ohError').textContent='';
  try{await api(record?'occupational_update':'occupational_create',{physical_id:record?.id,...data});await init()}
  catch(err){$('#ohError').textContent=err.message||String(err);button.disabled=false}
 };
}
async function init(){
 const root=$('#tmPage');root.innerHTML='<div class="tm-page-head"><div><span class="tm-kicker">SCREENINGS4U TESTING MANAGEMENT</span><h1>Occupational Health</h1><p>DOT and Non-DOT Physicals • Create, review, assign and issue donor passes for Customers, Employers, Owner-Operators and C/TPAs.</p></div><div class="tm-actions"><button class="tm-btn primary" id="ohNew">Create Physical</button></div></div><div id="ohEditor"></div><section class="tm-card"><div class="tm-card-head"><h2>Occupational Physicals</h2></div><div class="tm-card-body" style="overflow-x:auto"><table class="tm-table"><thead><tr><th>Order</th><th>Donor</th><th>Company</th><th>Physical</th><th>Recipient</th><th>Status</th><th>Donor Pass</th><th>Actions</th></tr></thead><tbody id="ohRows"><tr><td colspan="8">Loading…</td></tr></tbody></table></div></section>';
 $('#ohNew').onclick=()=>showForm(null);
 try{const d=await api('occupational_list');current=d.physicals||[];options=d;renderRows()}catch(e){$('#ohRows').innerHTML='<tr><td colspan="8">'+esc(e.message||String(e))+'</td></tr>'}
}
window.TestingPages=Object.freeze({init});
})();