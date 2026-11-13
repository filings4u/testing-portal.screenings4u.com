import {createClient} from "npm:@supabase/supabase-js@2";
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const safe=(v,n=120)=>String(v??"").trim().slice(0,n);
Deno.serve(async req=>{
const headers={"Access-Control-Allow-Origin":"https://testing-portal.screenings4u.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const response=(data,status=200)=>new Response(JSON.stringify(data),{headers,status});
if(req.method==="OPTIONS")return new Response(null,{headers,status:204});
if(req.method!=="POST")return response({error:"POST required"},405);
try{
const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if(!url||!key||!secret)return response({error:"Pricing management unavailable"},503);
const auth=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
const {data:{user},error}=await auth.auth.getUser(jwt);
if(error||!user)return response({error:"Sign in required"},401);
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const [staff,roles,access]=await Promise.all([
db.from("staff_profiles").select("employment_status").eq("user_id",user.id).maybeSingle(),
db.from("staff_role_assignments").select("id").eq("user_id",user.id).eq("active",true).limit(1),
db.from("staff_business_access").select("access_level,assigned_customers_only").eq("user_id",user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()
]);
if(staff.error||roles.error||access.error)throw staff.error||roles.error||access.error;
if(staff.data?.employment_status!=="active"||!roles.data?.length||!access.data||access.data.assigned_customers_only)return response({error:"Testing staff access denied"},403);
const body=await req.json().catch(()=>({})),action=safe(body.action,40);
if(action==="organizations"){
const org=await db.from("workforce_unified_records").select("tenant_id,data").eq("kind","organization").is("archived_at",null).order("created_at",{ascending:false}).limit(500);
if(org.error)throw org.error;
return response({ok:true,organizations:(org.data||[]).map(o=>({id:o.tenant_id,name:safe(o.data?.name||"C/TPA",150)}))});
}
if(!uuid(body.tenant_id))return response({error:"Choose C/TPA organization"},400);
const tenant=body.tenant_id,context=body.operating_context==="nondot"?"nondot":"dot";
const org=await db.from("workforce_unified_records").select("id").eq("kind","organization").eq("tenant_id",tenant).is("archived_at",null).maybeSingle();
if(org.error)throw org.error;
if(!org.data)return response({error:"Organization not found"},404);
if(action==="list"){
const [catalog,overrides]=await Promise.all([
db.from("workforce_ctpa_rate_catalog").select("id,service_name,service_code,category,default_price,currency,status,updated_at").eq("operating_context",context).order("category").order("service_name").limit(500),
db.from("workforce_ctpa_rate_overrides").select("rate_id,price,status,notes,updated_at").eq("tenant_id",tenant).limit(500)
]);
if(catalog.error||overrides.error)throw catalog.error||overrides.error;
const byId=new Map((overrides.data||[]).map(o=>[o.rate_id,o]));
return response({ok:true,rates:(catalog.data||[]).map(r=>({...r,override:byId.get(r.id)||null}))});
}
if(action!=="set_rate")return response({error:"Unknown action"},400);
if(!["admin","manager","editor"].includes(safe(access.data.access_level,30).toLowerCase()))return response({error:"Rates are restricted to authorized staff"},403);
if(!uuid(body.rate_id))return response({error:"Choose service"},400);
const rate=await db.from("workforce_ctpa_rate_catalog").select("id").eq("id",body.rate_id).eq("operating_context",context).maybeSingle();
if(rate.error)throw rate.error;
if(!rate.data)return response({error:"Service not found"},404);
const status=safe(body.status,30);
if(!["inherit","published","hidden"].includes(status))return response({error:"Invalid pricing status"},400);
const price=body.price===null||body.price===""?null:Number(body.price);
if(status==="published"&&(!Number.isFinite(price)||price===null||price<0||price>100000))return response({error:"Valid custom price is required"},400);
const saved=await db.from("workforce_ctpa_rate_overrides").upsert({tenant_id:tenant,rate_id:body.rate_id,status,price:status==="published"?price:null,notes:safe(body.notes,400),updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"tenant_id,rate_id"}).select("id").single();
if(saved.error)throw saved.error;
return response({ok:true,id:saved.data.id});
}catch(error){console.error("testing-ctpa-rate-admin",error);return response({error:"Unable to manage C/TPA pricing"},500)}
});