(()=>{'use strict';
const c=()=>window.testingSupabase;
async function invoke(slug,body={}){let {data,error}=await c().functions.invoke(slug,{body});if(error||data?.error){const r=await c().auth.refreshSession();if(!r.error&&r.data?.session?.access_token)({data,error}=await c().functions.invoke(slug,{body}));}if(error||data?.error)throw new Error(data?.error||error?.message||'Request failed.');return data}
async function requireAuth(){if(!window.TestingPortalGuard||!(await window.TestingPortalGuard.validate()))return null;const {data,error}=await c().auth.getSession();if(error)throw error;if(!data?.session?.access_token){location.replace('https://enterprise.screenings4u.com/portal-selector.html?portal=testing');return null}const state=await invoke(window.TESTING_PORTAL_CONFIG.contextFunction,{action:'context'});window.TESTING_AUTH_STATE={...state,session:data.session};return window.TESTING_AUTH_STATE}
async function signOut(){try{await c().auth.signOut({scope:'local'})}catch{}window.TestingPortalGuard?.clear();location.replace('https://enterprise.screenings4u.com/portal-selector.html')}
window.TestingAuth=Object.freeze({invoke,requireAuth,signOut});})();
