(()=>{'use strict';
const page=(location.pathname.split('/').pop()||'dashboard.html').toLowerCase();
const groups=[
 ['Control Center',[['dashboard.html','Dashboard','⌂']]],
 ['Lab Accounts',[['lab-companies.html','Companies','▣'],['lab-supplies.html','Supplies','▤'],['lab-supply-requests.html','Supply Requests','▤'],['lab-plan-upgrades.html','Plan Upgrades','▦'],['lab-plan-services.html','Plan Services','▤'],['lab-customer-documents.html','Customer Documents','▤'],['lab-advanced-services.html','Advanced Services','▣'],['lab-tracking.html','Tracking','⌁'],['lab-account-numbers.html','Account Numbers','#'],['lab-onboarding.html','Onboarding','✓']]],
 ['Testing Management',[['testing-operations.html','Testing Operations','▶'],['occupational-health.html','Occupational Health','✚'],['cases.html','Cases','▣'],['orders.html','Orders','▤'],['refunds.html','Refunds','↩'],['labcorp-orders.html','Labcorp Orders','◫'],['labcorp-sent.html','Sent Labcorp Tests','✓'],['labcorp-deliveries.html','Labcorp Deliveries','▣'],['labcorp-status-updates.html','Labcorp Statuses','◷'],['labcorp-incoming-results.html','Labcorp Results','✓'],['labcorp-coc-documents.html','Labcorp COC Documents','▤'],['labcorp-validation.html','Labcorp Validation','✓'],['results.html','Results','✓'],['donor-passes.html','Donor Passes','⌁'],['service-requests.html','Service Requests','≡'],['work-orders.html','Work Orders','▣'],['customers.html','Customers & Portal Access','◉'],['providers.html','Providers','◆'],['background-checks.html','Background Checks','▧'],['documents.html','Documents','▤'],['catalog.html','Catalog','▦'],['website.html','Website','◎'],['blog.html','Blog','✎'],['career-jobs.html','Careers','▣'],['career-applications.html','Applications','▤'],['support.html','Support','◉'],['reports.html','Reports','▥'],['settings.html','Settings','⚙']]]
];
const children={
 'lab-tracking.html':['lab-tracking-number.html'],
 'testing-operations.html':['testing-case.html','testing-case-schedule.html','testing-donor-pass.html','testing-collection.html','testing-lab-routing.html','testing-mro-review.html','testing-result-release.html','testing-case-events.html'],
 'cases.html':['case-create.html','case.html','case-customer.html','case-documents.html','case-history.html'],
 'refunds.html':['refund-create.html','refund.html'],
 'intake-forms.html':['intake-form.html'],'orders.html':['order-view.html','order-create.html','order.html','order-items.html','order-customer.html','order-payment.html','order-cases.html'],
 'labcorp-deliveries.html':['labcorp-delivery-detail.html'],'labcorp-orders.html':['labcorp-order-create.html','labcorp-order.html','labcorp-order-registration.html','labcorp-order-sites.html','labcorp-order-results.html','labcorp-order-events.html'],
 'results.html':['result.html','result-documents.html','result-upload.html','result-history.html'],
 'donor-passes.html':['donor-pass-create.html','donor-pass.html','donor-pass-labcorp.html','donor-pass-delivery.html','donor-pass-history.html'],
 'service-requests.html':['service-request-create.html','service-request.html','service-request-customer.html','service-request-assignment.html','service-request-history.html'],
 'work-orders.html':['work-order-create.html','work-order.html','work-order-assignment.html','work-order-services.html','work-order-customer.html','work-order-history.html'],
 'customers.html':['customer.html','customer-portal-access.html','customer-orders.html','customer-cases.html','customer-organizations.html','customer-history.html'],
 'providers.html':['provider-create.html','provider.html','provider-services.html','provider-locations.html','provider-contacts.html','provider-history.html'],
 'background-checks.html':['background-check-create.html','background-check.html','background-check-candidate.html','background-check-package.html','background-check-events.html'],
 'catalog.html':['catalog-create.html','catalog-service.html','catalog-pricing.html','catalog-fulfillment.html','catalog-website.html','catalog-history.html'],
 'documents.html':['document-upload.html','document.html','document-history.html'],
 'website.html':['website-pages.html','website-page-create.html','website-page.html','website-history.html'],
 'blog.html':['blog-create.html','blog-post.html','blog-media.html'],'career-jobs.html':['career-job.html'],'career-applications.html':['career-applicant.html'],'support.html':['support-ticket.html','support-history.html'],'reports.html':['report-detail.html']
};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nav(){return groups.map(([g,items])=>`<div class="tm-nav-group"><span>${esc(g)}</span>${items.map(([href,label,icon])=>{const active=page===href||(children[href]||[]).includes(page);return `<a href="${href}" class="${active?'active':''}"><i>${icon}</i><b>${esc(label)}</b></a>`}).join('')}</div>`).join('')}
function initials(n){return String(n||'TM').split(/\s+|@/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'TM'}
function render(state){const profile=state?.profile||{},user=state?.user||{},staff=state?.staff||{},name=profile.display_name||[profile.first_name,profile.last_name].filter(Boolean).join(' ')||user.email||'Testing Staff',role=state?.testing_access?.access_level||staff.job_title||'staff';document.body.innerHTML=`<div class="tm-app"><aside class="tm-sidebar" id="tmSidebar"><div class="tm-brand"><a href="dashboard.html"><img src="images/logo.png" alt="screenings4u"></a><small>Management Portal</small></div><div class="tm-workspace"><span>Workspace</span><strong>Testing Operations</strong></div><nav class="tm-nav">${nav()}</nav><div class="tm-sidebar-footer">testing-portal.screenings4u.com<br>Testing management control plane</div></aside><div class="tm-main"><header class="tm-topbar"><div class="tm-top-left"><button class="tm-menu" id="tmMenu">☰</button><div class="tm-top-title"><strong>screenings4u</strong><small>Testing Management Portal</small></div></div><div class="tm-top-actions"><a href="https://screenings4u.com" target="_blank" aria-label="Website">↗</a><a href="https://customers.screenings4u.com" target="_blank" aria-label="Customer portal">◉</a><button class="tm-user" id="tmUser"><span class="tm-avatar">${esc(initials(name))}</span><span class="tm-user-copy"><strong>${esc(name)}</strong><small>${esc(role)}</small></span></button></div></header><div class="tm-scroll"><main class="tm-page" id="tmPage"><div class="tm-loading">Loading Testing management…</div></main></div></div></div>`;const toggle=document.getElementById('tmMenu');const setMenu=(open)=>{document.body.classList.toggle('tm-menu-open',open);document.body.classList.toggle('tm-nav-hidden',!open&&window.innerWidth>760);toggle?.setAttribute('aria-expanded',String(open));};toggle?.setAttribute('aria-label','Show or hide navigation');toggle?.setAttribute('aria-controls','tmSidebar');toggle?.addEventListener('click',()=>{if(window.innerWidth<=760){document.body.classList.toggle('tm-menu-open');toggle.setAttribute('aria-expanded',String(document.body.classList.contains('tm-menu-open')))}else{document.body.classList.toggle('tm-nav-hidden');toggle.setAttribute('aria-expanded',String(!document.body.classList.contains('tm-nav-hidden')))}});document.querySelector('.tm-nav')?.addEventListener('click',()=>{if(window.innerWidth<=760){document.body.classList.remove('tm-menu-open');toggle?.setAttribute('aria-expanded','false')}});document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.classList.remove('tm-menu-open');toggle?.setAttribute('aria-expanded','false')}});document.querySelector('.tm-main')?.addEventListener('click',e=>{if(window.innerWidth<=760&&document.body.classList.contains('tm-menu-open')&&!e.target.closest('#tmMenu')){document.body.classList.remove('tm-menu-open');toggle?.setAttribute('aria-expanded','false')}});document.getElementById('tmUser')?.addEventListener('click',()=>window.TestingAuth.signOut())}

// Reusable nonblocking, branded dialogs (no native browser alerts).
const TestingDialogs=Object.freeze({
  open({title='screenings4u',message='',kind='confirm',confirmText='Continue',danger=false,defaultValue=''}) {
    return new Promise(resolve=>{
      const prior=document.activeElement;
      const backdrop=document.createElement('div');backdrop.className='tm-dialog-backdrop tm-brand-dialog-backdrop';
      const panel=document.createElement('section');panel.className='tm-dialog tm-brand-dialog';
      panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
      panel.setAttribute('aria-labelledby','tmBrandDialogTitle');
      const brand=document.createElement('div');brand.className='tm-dialog-brand';
      const img=document.createElement('img');img.src='images/logo2.png';img.alt='screenings4u';brand.appendChild(img);
      const body=document.createElement('div');body.className='tm-dialog-body';
      const heading=document.createElement('h2');heading.id='tmBrandDialogTitle';heading.textContent=title;
      const messageEl=document.createElement('p');messageEl.textContent=String(message);messageEl.style.whiteSpace='pre-wrap';
      body.append(heading,messageEl);let input=null;
      if(kind==='prompt'){input=document.createElement('textarea');input.rows=3;input.className='tm-dialog-input';input.value=String(defaultValue);input.setAttribute('aria-label',title);body.appendChild(input)}
      const actions=document.createElement('div');actions.className='tm-dialog-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.className='tm-btn';cancel.textContent='Cancel';
      const accept=document.createElement('button');accept.type='button';accept.className='tm-btn '+(danger?'danger':'primary');accept.textContent=confirmText;
      if(kind!=='alert')actions.append(cancel);else accept.textContent='OK';
      actions.append(accept);body.append(actions);panel.append(brand,body);backdrop.append(panel);document.body.append(backdrop);
      let done=false;
      function close(value){if(done)return;done=true;document.removeEventListener('keydown',keys,true);backdrop.remove();if(prior&&typeof prior.focus==='function')prior.focus();resolve(value)}
      function keys(e){if(e.key==='Escape'){e.preventDefault();close(kind==='prompt'?null:false)}else if(e.key==='Tab'){const elements=[...panel.querySelectorAll('button,textarea')];const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}
      document.addEventListener('keydown',keys,true);
      cancel.onclick=()=>close(kind==='prompt'?null:false);
      accept.onclick=()=>close(kind==='prompt'?input.value:true);
      backdrop.addEventListener('click',e=>{if(e.target===backdrop)close(kind==='prompt'?null:false)});
      (input||cancel&&kind!=='alert'?input||cancel:accept).focus();
    });
  },
  confirm(message,options={}){return this.open({title:'Please confirm',message,...options,kind:'confirm'})},
  alert(message,options={}){return this.open({title:'Notice',message,...options,kind:'alert'})},
  prompt(message,options={}){return this.open({title:'Your response',message,...options,kind:'prompt'})}
});
window.TestingDialogs=TestingDialogs;

window.TestingShell=Object.freeze({render,esc});})();
