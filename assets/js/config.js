(()=>{'use strict';
const config=Object.freeze({
 portalName:'Screenings4u Testing Management',portalHost:'testing-portal.screenings4u.com',managedWebsite:'https://screenings4u.com',managedCustomerPortal:'https://customers.screenings4u.com',
 supabaseUrl:'https://elpbnytpciqnbexiaebp.supabase.co',supabaseAnonKey:'sb_publishable_xVI6Mjkk1bNVMGHZCPuK6w_8FSHKdkC',
 contextFunction:'testing-management-context',readFunction:'testing-management-read',operationsFunction:'testing-operations-management',caseFunction:'testing-case-management',orderFunction:'testing-order-management',storageKey:'s4u-testing-management-session'});
window.TESTING_PORTAL_CONFIG=config;
if(window.supabase?.createClient)window.testingSupabase=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.sessionStorage,storageKey:config.storageKey}});
else console.error('[Testing Management] Supabase JS unavailable.');
})();
