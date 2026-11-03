import {createClient} from "npm:@supabase/supabase-js@2";
const out=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req)=>{
 if(req.method!=="POST")return out({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!key||req.headers.get("Authorization")!=="Bearer "+key)return out({error:"Unauthorized"},401);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await req.json().catch(()=>({})),id=String(body.order_id||"").trim();
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return out({error:"Valid order_id required"},400);
  const order=await db.from("orders").select("id,payment_status,paid_at").eq("id",id).maybeSingle();
  if(order.error)throw order.error;
  if(!order.data)return out({error:"Order not found"},404);
  const lab=await db.from("testing_labcorp_orders").select("*").eq("order_id",id);
  if(lab.error)throw lab.error;
  const environment=Deno.env.get("LABCORP_OTS_ENVIRONMENT")==="prod"?"prod":"cert";
  const autoFlag=environment==="prod"?"LABCORP_AUTO_PROD_ENABLED":"LABCORP_AUTO_CERT_ENABLED";
  // Mirror the shared registration gateway's production gates before checkout dispatch.
  // Never report "ready" if the gateway is guaranteed to reject the registration.
  const endpoint=Deno.env.get("LABCORP_OTS_ENDPOINT")||
    (environment==="prod"?"https://services.labcorpsolutions.com/webservice/services/LabcorpOTS":"https://services-cert.labcorpsolutions.com/webservice/services/LabcorpOTS");
  const configurationBlockers:string[]=[];
  let remote:URL|null=null;
  try{remote=new URL(endpoint)}catch{configurationBlockers.push("Invalid Labcorp endpoint URL")}
  const expectedHost=environment==="prod"?"services.labcorpsolutions.com":"services-cert.labcorpsolutions.com";
  if(remote&&(remote.protocol!=="https:"||remote.hostname!==expectedHost||
     remote.pathname!=="/webservice/services/LabcorpOTS"||remote.search||remote.hash||
     remote.username||remote.password))configurationBlockers.push("Labcorp endpoint does not match environment");
  if(!Deno.env.get("LABCORP_OTS_USER")||!Deno.env.get("LABCORP_OTS_PASSWORD"))
    configurationBlockers.push("Labcorp credentials are not configured");
  const checks=[];
  for(const record of lab.data||[]){
   const blockers=[...configurationBlockers];
   if(order.data.payment_status!=="paid"||!order.data.paid_at)blockers.push("Payment not confirmed");
   if(record.labcorp_registration_number){checks.push({labcorp_order_id:record.id,ready:true,already_registered:true,blockers:[]});continue}
   if(record.status!=="draft")blockers.push("Not a draft: manual reconciliation required");
   if(environment==="cert"&&!["01109090","393166","576898","576899"].includes(record.account_number))blockers.push("Invalid DEV account/location code");
   if(environment==="prod"&&!String(record.account_number||"").trim())blockers.push("Production account number missing");
   const item=record.order_item_id?await db.from("order_items").select("id,services(slug,metadata)").eq("id",record.order_item_id).eq("order_id",id).maybeSingle():null;
   if(item?.error)throw item.error;
   const service:any=item?.data?.services;
   if(!service||service.metadata?.labcorp_fulfillment!==true)blockers.push("Labcorp service not found");
   const dotProduct=environment==="prod"&&service?.metadata?.testing_scope==="dot"&&service?.metadata?.public_site==="screenings4u";
   const configuredPanels=dotProduct?["708392"]:(environment==="prod"?service?.metadata?.labcorp_prod_panel_ids:service?.metadata?.labcorp_panel_ids);
   const expected=Array.isArray(configuredPanels)?configuredPanels.map(String):[];
   if(!expected.length||JSON.stringify(expected)!==JSON.stringify(record.panel_ids||[]))blockers.push("Verified service panel IDs missing or mismatched");
   if(expected.length){
    const maps=await db.from("testing_labcorp_account_panels").select("panel_id,product_sku,mapping_status,enabled_for_submission").eq("environment",environment).eq("account_number",record.account_number).eq("account_location_code",record.account_location_code).in("panel_id",expected);
    if(maps.error)throw maps.error;
    if(!expected.every((panel:string)=>(maps.data||[]).some((m:any)=>m.panel_id===panel&&m.mapping_status==="approved"&&m.enabled_for_submission)))blockers.push("Approved product-to-panel mapping required");
   }
   if(!Array.isArray(record.panel_ids)||record.panel_ids.length===0)blockers.push("No panel assigned");
   if(environment==="cert"&&record.panel_ids.length!==1)blockers.push("Certification requires one panel");
   if(record.registration_expiration_at && new Date(record.registration_expiration_at).getTime()<=Date.now())blockers.push("Registration expiration is in the past");
   const account=dotProduct?"956811":(environment==="prod"?service?.metadata?.labcorp_prod_account_number:service?.metadata?.labcorp_account_number);
   if(account && account!==record.account_number)blockers.push("Service account mismatched");
   if(!record.donor_first_name||!record.donor_last_name||!record.donor_date_of_birth||!record.donor_state_of_residence||!record.donor_reason_for_test||!record.registration_expiration_at)blockers.push("Required donor information incomplete");
   if(!record.client_registration_id&&!record.labcorp_order_number&&!record.order_item_id)blockers.push("Client registration identifier missing");
   if((Deno.env.get(autoFlag)||"")!=="true")blockers.push("Automatic "+environment+" submissions not activated");
   if(environment==="prod"&&Deno.env.get("LABCORP_PROD_ENABLED")!=="true")blockers.push("Production submissions not enabled");
   checks.push({labcorp_order_id:record.id,ready:blockers.length===0,blockers});
  }
  return out({order_id:id,checks,submitted:false,ready:checks.length>0&&checks.every((c:any)=>c.ready)});
 }catch(e){console.error("Labcorp preflight error",e);return out({error:"Preflight failed"},500)}
});