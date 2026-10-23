import {createClient} from "npm:@supabase/supabase-js@2";
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...H,"Content-Type":"application/json","Cache-Control":"no-store"}});
const C=(v:any)=>String(v??"").trim(),N=()=>new Date().toISOString();
const esc=(v:any)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const tag=(n:string,v:any)=>v===null||v===undefined||v===""?"":`<${n}>${esc(v)}</${n}>`;
const bool=(n:string,v:any)=>`<${n}>${v?"true":"false"}</${n}>`;
const find=(xml:string,n:string)=>{const r=new RegExp("<(?:\\w+:)?"+n+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?"+n+">","i").exec(xml);return r?r[1].replace(/<[^>]+>/g,"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").trim():""};
async function ctx(req:Request){
 const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token)throw Object.assign(new Error("Authentication required."),{status:401});
 const ac=createClient(url,anon,{auth:{persistSession:false}}),db=createClient(url,svc,{auth:{persistSession:false}});
 const u=await ac.auth.getUser(token);if(u.error||!u.data.user)throw Object.assign(new Error("Authentication required."),{status:401});
 const [sp,ba]=await Promise.all([
  db.from("staff_profiles").select("employment_status").eq("user_id",u.data.user.id).maybeSingle(),
  db.from("staff_business_access").select("access_level").eq("user_id",u.data.user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()
 ]);
 if(sp.error)throw sp.error;if(ba.error)throw ba.error;
 if(!sp.data||sp.data.employment_status!=="active"||!ba.data)throw Object.assign(new Error("Testing Management access required."),{status:403});
 return{db,user:u.data.user};
}
const lc=()=>({endpoint:C(Deno.env.get("LABCORP_OTS_ENDPOINT"))||"https://services-cert.labcorpsolutions.com/webservice/services/LabcorpOTS",user:C(Deno.env.get("LABCORP_OTS_USER")),password:C(Deno.env.get("LABCORP_OTS_PASSWORD"))});
async function soap(action:string,inner:string){
 const c=lc();if(!c.endpoint||!c.user||!c.password)throw Object.assign(new Error("Labcorp OTS credentials are not configured yet."),{status:503});
 const body=`<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.ots.labcorp.com"><soapenv:Header/><soapenv:Body><ws:${action}>${tag("ws:userId",c.user)}${tag("ws:password",c.password)}${action==="getPanelDetails"?inner.replace(/<panelId>/g,"<ws:panelId>").replace(/<\/panelId>/g,"</ws:panelId>"):inner}</ws:${action}></soapenv:Body></soapenv:Envelope>`;
 const r=await fetch(c.endpoint,{method:"POST",headers:{"Content-Type":"text/xml; charset=utf-8","SOAPAction":action},body});
 const text=await r.text();if(!r.ok||/<(?:\w+:)?Fault\b/i.test(text)){const msg=find(text,"faultstring")||find(text,"errorDescription")||("Labcorp SOAP error "+r.status);throw Object.assign(new Error(msg),{status:r.status>=500?502:400,soap:text})}return text;
}
async function row(db:any,id:string){
 const q=await db.from("testing_labcorp_orders").select("*").eq("id",id).maybeSingle();if(q.error)throw q.error;if(!q.data)throw Object.assign(new Error("Labcorp order not found."),{status:404});
 const [events,order,item,caze]=await Promise.all([
  db.from("testing_labcorp_order_events").select("*").eq("labcorp_order_id",id).order("created_at",{ascending:false}),
  q.data.order_id?db.from("orders").select("*").eq("id",q.data.order_id).maybeSingle():Promise.resolve({data:null,error:null}),
  q.data.order_item_id?db.from("order_items").select("*,services(*)").eq("id",q.data.order_item_id).maybeSingle():Promise.resolve({data:null,error:null}),
  q.data.testing_case_id?db.from("testing_cases").select("*").eq("id",q.data.testing_case_id).maybeSingle():Promise.resolve({data:null,error:null})
 ]);for(const x of [events,order,item,caze])if(x.error)throw x.error;
 return{labcorp_order:q.data,events:events.data||[],order:order.data||null,order_item:item.data||null,case:caze.data||null,integration:{configured:Boolean(lc().endpoint&&lc().user&&lc().password),endpoint_configured:Boolean(lc().endpoint)}};
}
async function event(db:any,id:string,userId:string,type:string,direction="internal",notes:string|null=null,payload:any={}){
 const q=await db.from("testing_labcorp_order_events").insert({id:crypto.randomUUID(),labcorp_order_id:id,event_type:type,direction,notes,actor_user_id:userId,payload,created_at:N()});if(q.error)throw q.error;
}
function isDotAuthority(v:any){return ["FMCSA","FAA","FRA","FTA","PHMSA","USCG"].includes(String(v||"").trim().toUpperCase())}
function siteField(xml:string,name:string){const re=new RegExp("<(?:[a-zA-Z0-9_.-]+:)?"+name+"[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_.-]+:)?"+name+">","i");return (xml.match(re)?.[1]||"").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").trim()}
function siteResults(xml:string){const re=new RegExp("<(?:[a-zA-Z0-9_.-]+:)?locateCollectionSitesReturn[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_.-]+:)?locateCollectionSitesReturn>","gi");return [...xml.matchAll(re)].map(x=>{const v=x[1];return {id:siteField(v,"collectionSiteId"),name:siteField(v,"collectionSiteName"),address1:siteField(v,"address1"),address2:siteField(v,"address2"),city:siteField(v,"city"),state:siteField(v,"state"),zip:siteField(v,"zip"),distance:Number(siteField(v,"distance"))||0}}).filter(x=>x.id&&x.name)}
function regXml(r:any){
 const t=(key:string,val:any)=>val===null||val===undefined||String(val)===""?"":tag("data:"+key,val);
 const d=(v:any)=>v?new Date(v).toISOString():"";
 const panels=(r.panel_ids||[]).map((x:string)=>t("panelId",x)).join("");
 return `<ws:registration xmlns:data="http://data.ws.ots.labcorp.com">${t("clientRegistrationId",r.client_registration_id||r.labcorp_order_number)}${t("donorDateOfBirth",r.donor_date_of_birth?d(r.donor_date_of_birth+"T00:00:00Z"):"")}${t("donorId",r.donor_id)}${t("cdl_state",r.cdl_state)}${t("cdl_number",r.cdl_number)}${t("donorNameFirst",r.donor_first_name)}${t("donorNameLast",r.donor_last_name)}${t("donorNameMiddleInitial",r.donor_middle_initial)}${t("donorReasonForTest",r.donor_reason_for_test)}${t("donorStateOfResidence",r.donor_state_of_residence)}${r.observed_collection_requested?t("observedCollectionRequested","true"):t("observedCollectionRequested","false")}${panels}${t("registrationExpirationDate",d(r.registration_expiration_at))}${(isDotAuthority(r.testing_authority)||r.split_specimen_requested)?t("splitSpecimenRequested","true"):""}${t("accountLocationCode",r.account_location_code)}${t("accountNumber",r.account_number)}${t("testingAuthority",r.testing_authority)}</ws:registration>`;
}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:H});
 if(req.method!=="POST")return J({error:"Method not allowed."},405);
 try{
  const{db,user}=await ctx(req),b=await req.json().catch(()=>({})),a=C(b.action||"list");
  if(a==="list"){const q=await db.from("testing_labcorp_orders").select("*").order("created_at",{ascending:false}).limit(5000);if(q.error)throw q.error;return J({labcorp_orders:q.data||[],integration:{configured:Boolean(lc().endpoint&&lc().user&&lc().password),endpoint_configured:Boolean(lc().endpoint)}})}
  if(a==="options"){
   const [orders,cases]=await Promise.all([
    db.from("orders").select("*").eq("fulfillment_type","testing").order("created_at",{ascending:false}).limit(3000),
    db.from("testing_cases").select("*").order("created_at",{ascending:false}).limit(3000)
   ]);if(orders.error)throw orders.error;if(cases.error)throw cases.error;
   const ids=(orders.data||[]).map((x:any)=>x.id),items=ids.length?await db.from("order_items").select("*,services(*)").in("order_id",ids):{data:[],error:null};if(items.error)throw items.error;
   return J({orders:orders.data||[],order_items:items.data||[],cases:cases.data||[],integration:{configured:Boolean(lc().endpoint&&lc().user&&lc().password),endpoint_configured:Boolean(lc().endpoint)}})
  }
  if(a==="get"){const id=C(b.id||b.labcorp_order_id);if(!id)return J({error:"Labcorp order id is required."},400);return J(await row(db,id))}
const DEV_LABCORP_PANELS:Record<string,string[]>={"01109090":["806698"],"393166":["4549490002"],"576898":["PCA-10X3S-LC"],"576899":["4552950001","4552950002","4552950003","4552950004","4552950005","4552950006","4552950007","4552950008","4552950009","4552950010"]};
function validateDevAccount(x:any){const account=C(x.account_number),location=C(x.account_location_code),panels=Array.isArray(x.panel_ids)?x.panel_ids.map(C):[];if(!DEV_LABCORP_PANELS[account]||location!==account)return "Use an assigned Labcorp DEV account and matching location code";if(!panels.length||panels.some((id:string)=>!DEV_LABCORP_PANELS[account].includes(id)))return "Selected panel is not assigned to this Labcorp DEV account";if(account.length===6&&panels.length!==1)return "Six-digit Labcorp accounts support one panel per registration";return ""}
  if(a==="create"){const mappingError=validateDevAccount(b);if(mappingError)return J({error:mappingError},400);
   const orderId=C(b.order_id)||null,itemId=C(b.order_item_id)||null,caseId=C(b.testing_case_id)||null;
   const q=await db.from("testing_labcorp_orders").insert({
    id:crypto.randomUUID(),order_id:orderId,order_item_id:itemId,testing_case_id:caseId,customer_user_id:C(b.customer_user_id)||null,employer_id:C(b.employer_id)||null,
    status:"draft",account_number:C(b.account_number)||null,account_location_code:C(b.account_location_code)||null,client_registration_id:C(b.client_registration_id)||null,
    panel_ids:Array.isArray(b.panel_ids)?b.panel_ids.map(C).filter(Boolean):[],donor_first_name:C(b.donor_first_name)||null,donor_middle_initial:C(b.donor_middle_initial)||null,donor_last_name:C(b.donor_last_name)||null,donor_email:C(b.donor_email)||null,donor_phone:C(b.donor_phone)||null,donor_id:C(b.donor_id)||null,donor_state_of_residence:C(b.donor_state_of_residence)||null,donor_reason_for_test:C(b.donor_reason_for_test)||null,donor_date_of_birth:b.donor_date_of_birth||null,cdl_state:C(b.cdl_state)||null,cdl_number:C(b.cdl_number)||null,observed_collection_requested:Boolean(b.observed_collection_requested),split_specimen_requested:isDotAuthority(b.testing_authority)||Boolean(b.split_specimen_requested),testing_authority:C(b.testing_authority)||null,registration_expiration_at:b.registration_expiration_at||null,notes:C(b.notes)||null,metadata:{source:"testing_management",provider:"labcorp_ots"},created_by:user.id,updated_by:user.id,created_at:N(),updated_at:N()
   }).select("*").single();if(q.error)throw q.error;await event(db,q.data.id,user.id,"labcorp_order_created");return J({labcorp_order:q.data})
  }
  if(a==="update"){
   const id=C(b.id||b.labcorp_order_id),current=(await row(db,id)).labcorp_order,patch:any={updated_by:user.id,updated_at:N()};
   if(current.status!=="draft"||current.labcorp_registration_number)return J({error:"Registered or finalized Labcorp orders cannot be edited."},409);
   for(const f of ["account_number","account_location_code","client_registration_id","donor_first_name","donor_middle_initial","donor_last_name","donor_email","donor_phone","donor_id","donor_state_of_residence","donor_reason_for_test","cdl_state","cdl_number","testing_authority","notes","collection_site_id","collection_site_name","collection_site_address"])if(Object.prototype.hasOwnProperty.call(b,f))patch[f]=C(b[f])||null;
   for(const f of ["donor_date_of_birth","registration_expiration_at"])if(Object.prototype.hasOwnProperty.call(b,f))patch[f]=b[f]||null;
   if(Object.prototype.hasOwnProperty.call(b,"panel_ids"))patch.panel_ids=Array.isArray(b.panel_ids)?b.panel_ids.map(C).filter(Boolean):[];
   if(Object.prototype.hasOwnProperty.call(b,"observed_collection_requested"))patch.observed_collection_requested=Boolean(b.observed_collection_requested);
   patch.split_specimen_requested=isDotAuthority(Object.prototype.hasOwnProperty.call(b,"testing_authority")?b.testing_authority:current.testing_authority)||Boolean(Object.prototype.hasOwnProperty.call(b,"split_specimen_requested")?b.split_specimen_requested:current.split_specimen_requested);
   const mappingError=validateDevAccount({...current,...patch});if(mappingError)return J({error:mappingError},400);
   const q=await db.from("testing_labcorp_orders").update(patch).eq("id",id).select("*").single();if(q.error)throw q.error;await event(db,id,user.id,"labcorp_order_updated","internal",C(b.change_note)||null,{previous_status:current.status});return J({labcorp_order:q.data})
  }
  if(a==="submit"){
   const id=C(b.id||b.labcorp_order_id),d=await row(db,id),r=d.labcorp_order;
   for(const [k,v] of [["account number",r.account_number],["donor first name",r.donor_first_name],["donor last name",r.donor_last_name],["reason for test",r.donor_reason_for_test],["state of residence",r.donor_state_of_residence],["registration expiration",r.registration_expiration_at]])if(!v)return J({error:"Labcorp "+k+" is required before submission."},400);
   if(r.status!=="draft"||r.labcorp_registration_number)return J({error:"Only unregistered draft orders may be submitted."},409);
   const mappingError=validateDevAccount(r);if(mappingError)return J({error:mappingError},409);
   const config=lc();if(!config.endpoint.startsWith("https://services-cert.labcorpsolutions.com/"))return J({error:"Production Labcorp submissions require separate go-live approval."},409);
   if(!Array.isArray(r.panel_ids)||r.panel_ids.length===0)return J({error:"At least one mapped Labcorp panel is required."},400);
   for(const panel of r.panel_ids){const m=await db.from("testing_labcorp_account_panels").select("mapping_status,enabled_for_submission").eq("account_number",r.account_number).eq("account_location_code",r.account_location_code).eq("panel_id",panel).eq("environment","cert").eq("mapping_status","approved").eq("enabled_for_submission",true).limit(1);if(m.error)throw m.error;if(!m.data?.length)return J({error:"Labcorp panel "+panel+" is not approved for certification submission."},409);}
   // One shared Labcorp registration engine; never call Labcorp SOAP directly here.
   const svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",url=Deno.env.get("SUPABASE_URL")||"";
   const upstream=await fetch(url+"/functions/v1/testing-labcorp-register-shared",{method:"POST",headers:{"Authorization":"Bearer "+svc,"apikey":svc,"Content-Type":"application/json"},body:JSON.stringify({labcorp_order_id:id,mode:"manual"}),signal:AbortSignal.timeout(35000)});
   const result=await upstream.json().catch(()=>({error:"Invalid shared registration response; reconcile before retry"}));
   if(!upstream.ok)return J(result,upstream.status);
   return J(result);
  }
  if(a==="get_registration"){
   const id=C(b.id||b.labcorp_order_id),d=await row(db,id),r=d.labcorp_order;if(!r.labcorp_registration_number)return J({error:"This order has not been registered with Labcorp."},409);
   const xml=await soap("getRegistrationDetails",tag("labcorpRegistrationNumber",r.labcorp_registration_number));
   const patch:any={last_synced_at:N(),updated_by:user.id,updated_at:N()};
   const specimen=find(xml,"specimenId");if(specimen)patch.specimen_id=specimen;const acc=find(xml,"accessionNumber");if(acc)patch.accession_number=acc;
   const q=await db.from("testing_labcorp_orders").update(patch).eq("id",id).select("*").single();if(q.error)throw q.error;await event(db,id,user.id,"labcorp_registration_synced","outbound",null,{raw_response_received:true});return J({labcorp_order:q.data})
  }

  if(a==="get_account_details"){const account=C(b.account_number),location=C(b.account_location_code||account);if(!["01109090","393166","576898","576899"].includes(account)||location!==account)return J({error:"Select an assigned DEV account and its matching location code"},400);const xml=await soap("getAccountDetails",tag("ws:accountNumber",account)+tag("ws:accountLocationCode",location));return J({account_number:account,account_location_code:location,has_account_details_return:/(?:getAccountDetailsReturn)/i.test(xml),raw_xml:xml})}
  if(a==="catalog_review"){const panelRows=await db.from("testing_labcorp_account_panels").select("panel_id,account_number,account_location_code,environment,product_sku,mapping_status,enabled_for_submission,notes").eq("environment","cert").order("account_number").order("panel_id");if(panelRows.error)throw panelRows.error;const services=await db.from("services").select("sku,name,description,active,metadata").eq("product_type","service").eq("active",true);if(services.error)throw services.error;return J({accounts:[...new Set((panelRows.data||[]).map((x:any)=>x.account_number))],panels:panelRows.data||[],assigned_panels:panelRows.data||[],other_requested_panels:[],services:(services.data||[]).filter((x:any)=>/drug|panel|alcohol|etg|hair|instant/i.test(x.name+" "+x.sku))})}
  if(a==="get_panel"){
   const panel=C(b.panel_id);if(!panel)return J({error:"Panel id is required."},400);
   if(!Object.values(DEV_LABCORP_PANELS).some((ids:string[])=>ids.includes(panel)))return J({error:"Only assigned Labcorp DEV panels may be looked up."},400);const xml=await soap("getPanelDetails",tag("panelId",panel));return J({panel_id:panel,raw_xml:xml})
  }
  if(a==="locate_sites"){
   const zip=C(b.zip),distance=Math.max(0,Math.min(99,Number(b.distance||25)));if(!/^\d{5}$/.test(zip))return J({error:"A valid 5-digit ZIP code is required."},400);
   const xml=await soap("locateCollectionSites",tag("ws:zip",zip)+tag("ws:distance",distance));return J({zip,distance,sites:siteResults(xml)})
  }
  if(a==="select_site"){
   const id=C(b.id||b.labcorp_order_id),siteId=C(b.site_id);
   if(!id||!siteId||siteId.length>120)return J({error:"Order ID and collection site ID required."},400);
   await row(db,id);
   const xml=await soap("getCollectionSite",tag("ws:siteId",siteId));
   const raw=xml.match(new RegExp("<(?:[a-zA-Z0-9_.-]+:)?getCollectionSiteReturn[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_.-]+:)?getCollectionSiteReturn>","i"))?.[1]||"";
   const name=siteField(raw,"collectionSiteName"),confirmedId=siteField(raw,"collectionSiteId");
   if(!name||confirmedId!==siteId)return J({error:"Labcorp could not verify the selected site."},422);
   const address=[siteField(raw,"address1"),siteField(raw,"address2"),[siteField(raw,"city"),siteField(raw,"state"),siteField(raw,"zip")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
   if(!address)return J({error:"Labcorp returned no collection address."},422);
   const u=await db.from("testing_labcorp_orders").update({collection_site_id:siteId,collection_site_name:name,collection_site_address:address,updated_by:user.id,updated_at:N()}).eq("id",id).select("*").single();if(u.error)throw u.error;
   const passes=await db.from("testing_donor_passes").select("id").contains("metadata",{labcorp_order_id:id}).in("status",["draft","issued"]);if(passes.error)throw passes.error;
   for(const pass of passes.data||[]){const x=await db.from("testing_donor_passes").update({collection_site_name:name,collection_site_address:address,updated_at:N()}).eq("id",pass.id);if(x.error)throw x.error}
   await event(db,id,user.id,"collection_site_assigned","internal",null,{site_id:siteId,site_name:name});
   return J({site:{id:siteId,name,address},labcorp_order:u.data,updated_passes:passes.data?.length||0});
  }
  if(a==="resend"){
   const id=C(b.id||b.labcorp_order_id),type=Number(b.resend_type||1),d=await row(db,id),r=d.labcorp_order;if(!r.labcorp_registration_number)return J({error:"Labcorp registration number is required."},409);
   await soap("resend",tag("labcorpRegistrationNumber",r.labcorp_registration_number)+tag("resendTypeId",type));await event(db,id,user.id,"labcorp_resend_requested","outbound",null,{resend_type:type});return J({ok:true})
  }
  if(a==="delete_registration"){
   const id=C(b.id||b.labcorp_order_id),d=await row(db,id),r=d.labcorp_order;if(!r.labcorp_registration_number)return J({error:"Labcorp registration number is required."},409);
   await soap("deleteRegistration",tag("labcorpRegistrationNumber",r.labcorp_registration_number));
   const q=await db.from("testing_labcorp_orders").update({status:"cancelled",updated_by:user.id,updated_at:N()}).eq("id",id).select("*").single();if(q.error)throw q.error;await event(db,id,user.id,"labcorp_registration_deleted","outbound",C(b.notes)||null);return J({labcorp_order:q.data})
  }
  return J({error:"Unsupported Labcorp order action."},400);
 }catch(e:any){console.error("testing-labcorp-order-management",e);return J({error:e instanceof Error?e.message:String(e)},Number(e?.status||500))}
});