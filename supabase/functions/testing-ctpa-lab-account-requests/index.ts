import {createClient} from "npm:@supabase/supabase-js@2";
const ORIGIN="https://testing-portal.screenings4u.com";
const HEAD={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:HEAD});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const clean=(v:unknown,max=160)=>String(v??"").trim().slice(0,max);
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:HEAD});
 if(request.method!=="POST")return reply({error:"POST required"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service)return reply({error:"Testing Operations backend not configured"},503);
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:ae}=await auth.auth.getUser(token);
  if(ae||!user)return reply({error:"Testing staff authentication required"},401);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const [profile,roles,grant]=await Promise.all([
   db.from("staff_profiles").select("employment_status").eq("user_id",user.id).maybeSingle(),
   db.from("staff_role_assignments").select("id").eq("user_id",user.id).eq("active",true).limit(1),
   db.from("staff_business_access").select("access_level,assigned_customers_only").eq("user_id",user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()
  ]);
  if(profile.error||roles.error||grant.error)throw profile.error||roles.error||grant.error;
  if(profile.data?.employment_status!=="active"||!roles.data?.length||!grant.data)return reply({error:"Testing Operations access denied"},403);
  if(grant.data.assigned_customers_only)return reply({error:"This queue requires unrestricted Testing Operations access"},403);
  const body=await request.json().catch(()=>({})),action=clean(body.action,30)||"list";
  const records=db.from("workforce_unified_records");
  const sourceTypes=["ctpa_lab_account_request","ctpa_lab_account_manual"];
  if(action==="list"){
   const q=await records.select("id,tenant_id,operating_context,data,created_at,updated_at")
    .eq("kind","lab_accounts").in("data->>source",sourceTypes)
    .is("archived_at",null).order("created_at",{ascending:false}).limit(400);
   if(q.error)throw q.error;
   return reply({ok:true,requests:q.data||[],can_fulfill:["admin","manager","editor"].includes(String(grant.data.access_level||"").toLowerCase())});
  }
  if(!["admin","manager","editor"].includes(String(grant.data.access_level||"").toLowerCase()))
   return reply({error:"Testing Operations edit permission required"},403);
  if(!uuid(body.id))return reply({error:"Select a valid account request"},400);
  const found=await records.select("id,tenant_id,operating_context,data,updated_at").eq("id",body.id)
   .eq("kind","lab_accounts").in("data->>source",sourceTypes).is("archived_at",null).maybeSingle();
  if(found.error)throw found.error;
  if(!found.data)return reply({error:"Request not found"},404);
  const previous=found.data.data||{};
  if(action==="review"){
   if(previous.status==="issued")return reply({error:"Issued accounts cannot be returned to review"},409);
   const patch={...previous,status:"in_review",fulfillment_status:"staff_review",
    review_notes:clean(body.notes,1500),reviewed_by:user.id,reviewed_at:new Date().toISOString()};
   const update=await records.update({data:patch,updated_at:new Date().toISOString(),updated_by:user.id})
    .eq("id",found.data.id).eq("tenant_id",found.data.tenant_id).eq("updated_at",found.data.updated_at)
    .select("id").maybeSingle();
   if(update.error)throw update.error;
   if(!update.data)return reply({error:"Request changed. Reload it and try again"},409);
   return reply({ok:true,status:"in_review"});
  }
  if(action==="issue"){
   if(previous.status==="issued")return reply({error:"This account has already been issued"},409);
   const accountNumber=clean(body.account_number,120),provider=clean(body.provider,160),
    sourceId=clean(body.lab_account_record_id,90),purchaseReference=clean(body.purchase_reference,120);
   if(!uuid(sourceId)||!accountNumber||!purchaseReference)
    return reply({error:"Select the authoritative lab account record and enter its verified purchase reference"},400);
   const original=await db.from("ctpa_portal_lab_accounts").select("id,account_code,status,lab_name,ctpa_id,tenant_id")
    .eq("id",sourceId).eq("account_code",accountNumber).eq("status","active").maybeSingle();
   if(original.error)throw original.error;
   if(!original.data)return reply({error:"An active laboratory account with this ID and number must exist in Testing Operations"},409);
   // Testing staff must explicitly confirm account ownership and the separate paid purchase record.
   if(body.confirm_verified_ownership!==true)return reply({error:"Confirm the lab account belongs to this C/TPA customer before assigning it"},400);
   if(body.confirm_purchase_checked!==true)return reply({error:"Confirm the purchase record has been checked"},400);
   const d={...previous,status:"issued",fulfillment_status:"issued",source:"testing_ops_issued",
    account_number:accountNumber,provider:provider||original.data.lab_name||"",
    issued_by_testing:true,ready_for_orders:true,issued_by_user_id:user.id,
    issued_at:new Date().toISOString(),verified_lab_source_id:original.data.id,
    verified_source_tenant_id:original.data.tenant_id,
    verified_source_ctpa_id:original.data.ctpa_id,
    purchase_reference:purchaseReference,review_notes:clean(body.notes,1500)};
   const update=await records.update({data:d,updated_at:new Date().toISOString(),updated_by:user.id})
    .eq("id",found.data.id).eq("tenant_id",found.data.tenant_id).eq("updated_at",found.data.updated_at)
    .select("id").maybeSingle();
   if(update.error)throw update.error;
   if(!update.data)return reply({error:"Request changed. Refresh before trying again"},409);
   return reply({ok:true,status:"issued",account_number:accountNumber});
  }
  return reply({error:"Unknown action"},400);
 }catch(e){console.error("testing-ctpa-lab-account-requests",e);return reply({error:"Unable to process C/TPA lab account requests"},500)}
});