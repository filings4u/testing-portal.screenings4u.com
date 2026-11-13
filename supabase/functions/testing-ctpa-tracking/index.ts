import {createClient} from "npm:@supabase/supabase-js@2";
const ORIGIN="https://testing-portal.screenings4u.com";
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const safe=(v:unknown,n=200)=>String(v??"").trim().slice(0,n);
Deno.serve(async req=>{
 const headers={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply({error:"POST only"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await auth.auth.getUser(jwt);
  if(error||!user)return reply({error:"Sign in required"},401);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const [staff,roles,access]=await Promise.all([
   db.from("staff_profiles").select("employment_status").eq("user_id",user.id).maybeSingle(),
   db.from("staff_role_assignments").select("id").eq("user_id",user.id).eq("active",true).limit(1),
   db.from("staff_business_access").select("access_level,assigned_customers_only").eq("user_id",user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()
  ]);
  if(staff.error||roles.error||access.error)throw staff.error||roles.error||access.error;
  if(staff.data?.employment_status!=="active"||!roles.data?.length||!access.data||access.data.assigned_customers_only)return reply({error:"Testing staff access denied"},403);
  const body=await req.json().catch(()=>({})),action=safe(body.action,32);
  if(action==="workspaces"){
   const members=await db.from("workforce_unified_records").select("tenant_id").eq("kind","membership").eq("data->>status","active").is("archived_at",null).limit(1000);
   if(members.error)throw members.error;
   const ids=[...new Set((members.data||[]).map((m:any)=>m.tenant_id))];
   if(!ids.length)return reply({ok:true,workspaces:[]});
   const org=await db.from("workforce_unified_records").select("tenant_id,data").eq("kind","organization").in("tenant_id",ids).is("archived_at",null).limit(1000);
   if(org.error)throw org.error;
   return reply({ok:true,workspaces:(org.data||[]).map((r:any)=>({id:r.tenant_id,name:safe(r.data?.name,150)||"C/TPA"}))});
  }
  if(action==="employers"){
   if(!uuid(body.tenant_id))return reply({error:"Choose C/TPA"},400);
   const context=body.operating_context==="nondot"?"nondot":"dot";
   const employers=await db.from("workforce_unified_records").select("id,kind,data").eq("tenant_id",body.tenant_id).eq("operating_context",context).in("kind",context==="dot"?["employers","owner_operators"]:["employers"]).is("archived_at",null).limit(500);
   if(employers.error)throw employers.error;
   return reply({ok:true,employers:(employers.data||[]).map((r:any)=>({id:r.id,name:safe(r.data?.legal_name||r.data?.dba_name,150),email:safe(r.data?.contact_email||r.data?.email||r.data?.billing_email,180)}))});
  }
  if(action==="list"){
   const data=await db.from("workforce_ctpa_shipments").select("*").order("created_at",{ascending:false}).limit(250);
   if(data.error)throw data.error;
   return reply({ok:true,shipments:data.data||[]});
  }
  if(action!=="publish")return reply({error:"Unknown action"},400);
  if(!["admin","manager","editor"].includes(safe(access.data.access_level,30).toLowerCase()))return reply({error:"Insufficient permissions"},403);
  const tenant=body.tenant_id,employerId=body.employer_record_id,context=body.operating_context==="nondot"?"nondot":"dot";
  if(!uuid(tenant)||!uuid(employerId))return reply({error:"Choose valid C/TPA and employer"},400);
  const company=await db.from("workforce_unified_records").select("id,data").eq("id",employerId).eq("tenant_id",tenant).eq("operating_context",context).in("kind",context==="dot"?["employers","owner_operators"]:["employers"]).is("archived_at",null).maybeSingle();
  if(company.error)throw company.error;
  if(!company.data)return reply({error:"Employer not found in selected C/TPA workspace"},403);
  const name=safe(company.data.data?.legal_name||company.data.data?.dba_name,160);
  const emails=[company.data.data?.contact_email,company.data.data?.email,company.data.data?.billing_email].map((x:any)=>safe(x,180).toLowerCase()).filter(Boolean);
  const recipient=safe(body.employer_email,180).toLowerCase();
  if(!name||!emails.includes(recipient)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))return reply({error:"Select a verified employer contact email"},400);
  const carrier=safe(body.carrier,10).toUpperCase(),tracking=safe(body.tracking_number,80).replace(/\s/g,""),status=safe(body.shipment_status,32);
  if(!["USPS","UPS","FEDEX"].includes(carrier)||!/^[a-zA-Z0-9]{6,80}$/.test(tracking))return reply({error:"Valid carrier and tracking number required"},400);
  if(!["preparing","shipped","in_transit","out_for_delivery","delivered","exception"].includes(status))return reply({error:"Invalid shipment status"},400);
  for(const value of [body.shipped_at,body.expected_delivery_at])if(value&&!Number.isFinite(Date.parse(value)))return reply({error:"Invalid shipment date"},400);
  const values={tenant_id:tenant,operating_context:context,employer_record_id:employerId,employer_name:name,employer_email:recipient,carrier,tracking_number:tracking,shipment_status:status,order_reference:safe(body.order_reference,120),contents:safe(body.contents,500),shipped_at:body.shipped_at?new Date(body.shipped_at).toISOString():null,expected_delivery_at:body.expected_delivery_at?new Date(body.expected_delivery_at).toISOString():null,delivered_at:status==="delivered"?new Date().toISOString():null,updated_at:new Date().toISOString(),updated_by:user.id};
  const existing=await db.from("workforce_ctpa_shipments").select("id").eq("tenant_id",tenant).eq("carrier",carrier).eq("tracking_number",tracking).maybeSingle();
  if(existing.error)throw existing.error;
  let result;
  if(existing.data){result=await db.from("workforce_ctpa_shipments").update(values).eq("id",existing.data.id).select("id").single()}
  else result=await db.from("workforce_ctpa_shipments").insert({...values,created_by:user.id}).select("id").single();
  if(result.error)throw result.error;
  return reply({ok:true,shipment_id:result.data.id});
 }catch(err){console.error("testing-ctpa-tracking",err);return reply({error:"Unable to manage tracking"},500)}
});