import {createClient} from "npm:@supabase/supabase-js@2";
import {registerDonor,validate,LabcorpError,type Registration} from "../_shared/labcorp-registration-core.ts";
const J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const err=(m:string,status=409)=>{throw Object.assign(new Error(m),{status})};
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return J({error:"POST required"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!key||req.headers.get("Authorization")!=="Bearer "+key)return J({error:"Service-to-service authentication required"},401);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let claimed=false,id="";
 try{
  const body=await req.json();id=String(body.labcorp_order_id||"");const mode=String(body.mode||"");
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||!["manual","automatic"].includes(mode))err("Invalid order or mode",400);
  const q=await db.from("testing_labcorp_orders").select("*").eq("id",id).maybeSingle();if(q.error)throw q.error;const r=q.data;
  if(!r)err("Labcorp draft not found",404);
  if(r.labcorp_registration_number)return J({ok:true,already_registered:true,registration_number:r.labcorp_registration_number});
  if(r.status!=="draft")err("Registration requires reconciliation before another attempt");
  const d:Registration={...r,client_registration_id:r.client_registration_id||r.labcorp_order_number};validate(d);
  const mapping=await db.from("testing_labcorp_account_panels").select("panel_id,mapping_status,enabled_for_submission").eq("environment","cert").eq("account_number",r.account_number).eq("account_location_code",r.account_location_code).in("panel_id",r.panel_ids);if(mapping.error)throw mapping.error;
  if(!r.panel_ids.every((p:string)=>(mapping.data||[]).some((m:any)=>m.panel_id===p&&m.mapping_status==="approved"&&m.enabled_for_submission===true)))err("Panel approval required");
  if(mode==="automatic"){
   if(Deno.env.get("LABCORP_AUTO_CERT_ENABLED")!=="true")err("Automatic certification submission disabled");
   if(!r.order_id||!r.order_item_id)err("Paid order/item linkage required");
   const payment=await db.from("orders").select("payment_status,paid_at").eq("id",r.order_id).maybeSingle();if(payment.error)throw payment.error;
   if(payment.data?.payment_status!=="paid"||!payment.data?.paid_at)err("Payment not confirmed");
   const item=await db.from("order_items").select("services(metadata)").eq("order_id",r.order_id).eq("id",r.order_item_id).maybeSingle();if(item.error)throw item.error;
   const service:any=item.data?.services,expected=service?.metadata?.labcorp_panel_ids;
   if(service?.metadata?.labcorp_fulfillment!==true||!Array.isArray(expected)||JSON.stringify(expected.map(String))!==JSON.stringify(r.panel_ids))err("Paid product-panel mapping mismatch");
  }
  const endpoint=Deno.env.get("LABCORP_OTS_ENDPOINT")||"https://services-cert.labcorpsolutions.com/webservice/services/LabcorpOTS";
  const user=Deno.env.get("LABCORP_OTS_USER")||"",password=Deno.env.get("LABCORP_OTS_PASSWORD")||"";
  // Pre-check configuration before claiming a draft to avoid stranded orders.
  let certUrl:URL;
  try{certUrl=new URL(endpoint)}catch{err("Labcorp certification endpoint is not a valid URL",503)}
  if(certUrl!.protocol!=="https:"||certUrl!.hostname!=="services-cert.labcorpsolutions.com")err("Labcorp certification endpoint is not approved",503);
  if(!user||!password)err("Labcorp certification credentials are not configured",503);
  if(body.validate_only===true)return J({ok:true,eligible:true,mode,labcorp_order_id:id,will_submit:false});
  const claim=await db.from("testing_labcorp_orders").update({status:"submitting",client_registration_id:d.client_registration_id,updated_at:new Date().toISOString()}).eq("id",id).eq("status","draft").is("labcorp_registration_number",null).select("id").maybeSingle();if(claim.error)throw claim.error;if(!claim.data)err("Draft was already claimed");claimed=true;
  const result=await registerDonor(d,{endpoint,user,password});
  const timestamp=result.registrationDateTime&&Number.isFinite(Date.parse(result.registrationDateTime))?new Date(result.registrationDateTime).toISOString():new Date().toISOString();
  const saved=await db.from("testing_labcorp_orders").update({status:"registered",labcorp_registration_number:result.registrationNumber,registration_created_at:timestamp,submitted_at:new Date().toISOString(),last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).eq("status","submitting").select("id,labcorp_registration_number,status").single();if(saved.error)throw saved.error;
  return J({ok:true,labcorp_order:saved.data});
 }catch(e:any){
  if(claimed){const x=await db.from("testing_labcorp_orders").update({status:"manual_reconciliation_required",updated_at:new Date().toISOString()}).eq("id",id).eq("status","submitting");if(x.error)console.error("Reconciliation status persist failed",x.error.code)}
  // Never send raw SOAP or donor PII to the caller.
  const safe=e instanceof LabcorpError?{error:e.message,labcorp_error_code:e.code,labcorp_error_element:e.element}:{error:e instanceof Error?e.message:"Registration failed"};
  return J({...safe,reconciliation_required:claimed},Number(e?.status||500));
 }
});