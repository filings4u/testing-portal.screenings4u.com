(()=>{'use strict';
const page=(location.pathname.split('/').pop()||'dashboard.html').toLowerCase();
const groups=[
 ['Control Center',[['dashboard.html','Dashboard','⌂']]],
 ['Testing Management',[['testing-operations.html','Testing Operations','▶'],['cases.html','Cases','▣'],['orders.html','Orders','▤'],['labcorp-orders.html','Labcorp Orders','◫'],['results.html','Results','✓'],['donor-passes.html','Donor Passes','⌁'],['service-requests.html','Service Requests','≡'],['work-orders.html','Work Orders','▣'],['customers.html','Customers & Portal Access','◉'],['providers.html','Providers','◆'],['background-checks.html','Background Checks','▧'],['documents.html','Documents','▤']]]
];
const children={
 'testing-operations.html':['testing-case.html','testing-case-schedule.html','testing-donor-pass.html','testing-collection.html','testing-lab-routing.html','testing-mro-review.html','testing-result-release.html','testing-case-events.html'],
 'cases.html':['case-create.html','case.html','case-customer.html','case-documents.html','case-history.html'],
 'orders.html':['order-create.html','order.html','order-items.html','order-customer.html','order-payment.html','order-cases.html'],
 'labcorp-orders.html':['labcorp-order-create.html','labcorp-order.html','labcorp-order-registration.html','labcorp-order-sites.html','labcorp-order-results.html','labcorp-order-events.html'],
 'results.html':['result.html','result-documents.html','result-upload.html','result-history.html'],
 'donor-passes.html':['donor-pass-create.html','donor-pass.html','donor-pass-labcorp.html','donor-pass-delivery.html','donor-pass-history.html'],
 'service-requests.html':['service-request-create.html','service-request.html','service-request-customer.html','service-request-assignment.html','service-request-history.html'],
 'work-orders.html':['work-order-create.html','work-order.html','work-order-assignment.html','work-order-services.html','work-order-customer.html','work-order-history.html'],
 'customers.html':['customer.html','customer-portal-access.html','customer-orders.html','customer-cases.html','customer-organizations.html','customer-history.html'],
 'providers.html':['provider-create.html','provider.html','provider-services.html','provider-locations.html','provider-contacts.html','provider-history.html'],
 'background-checks.html':['background-check-create.html','background-check.html','background-check-candidate.html','background-check-package.html','background-check-events.html'],
 'catalog.html':['catalog-create.html','catalog-service.html','catalog-pricing.html','catalog-fulfillment.html','catalog-website.html','catalog-history.html'],
 'documents.html':['document-upload.html','document.html','document-history.html']
};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nav(){return groups.map(([g,items])=>`<div class="tm-nav-group"><span>${esc(g)}</span>${items.map(([href,label,icon])=>{const active=page===href||(children[href]||[]).includes(page);return `<a href="${href}" class="${active?'active':''}"><i>${icon}</i><b>${esc(label)}</b></a>`}).join('')}</div>`).join('')}
function initials(n){return String(n||'TM').split(/\s+|@/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'TM'}
function render(state){const profile=state?.profile||{},user=state?.user||{},staff=state?.staff||{},name=profile.display_name||[profile.first_name,profile.last_name].filter(Boolean).join(' ')||user.email||'Testing Staff',role=state?.testing_access?.access_level||staff.job_title||'staff';document.body.innerHTML=`<div class="tm-app"><aside class="tm-sidebar"><div class="tm-brand"><a href="dashboard.html"><img src="images/logo.png" alt="Screenings4u"></a><small>Management Portal</small></div><div class="tm-workspace"><span>Workspace</span><strong>Testing Operations</strong></div><nav class="tm-nav">${nav()}</nav><div class="tm-sidebar-footer">testing-portal.screenings4u.com<br>Testing management control plane</div></aside><div class="tm-main"><header class="tm-topbar"><div class="tm-top-left"><button class="tm-menu" id="tmMenu">☰</button><div class="tm-top-title"><strong>Screenings4u</strong><small>Testing Management Portal</small></div></div><div class="tm-top-actions"><a href="https://screenings4u.com" target="_blank" aria-label="Website">↗</a><a href="https://customers.screenings4u.com" target="_blank" aria-label="Customer portal">◉</a><button class="tm-user" id="tmUser"><span class="tm-avatar">${esc(initials(name))}</span><span class="tm-user-copy"><strong>${esc(name)}</strong><small>${esc(role)}</small></span></button></div></header><div class="tm-scroll"><main class="tm-page" id="tmPage"><div class="tm-loading">Loading Testing management…</div></main></div></div></div>`;document.getElementById('tmMenu')?.addEventListener('click',()=>document.body.classList.toggle('tm-menu-open'));document.getElementById('tmUser')?.addEventListener('click',()=>window.TestingAuth.signOut())}
window.TestingShell=Object.freeze({render,esc});})();
