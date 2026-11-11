import {createClient} from "npm:@supabase/supabase-js@2";
const CORS={"Access-Control-Allow-Origin":"https://testing-portal.screenings4u.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:CORS});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:CORS,status:204});
 if(req.method!=="POST")return out({error:"POST required"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,pub=Deno.env.get("SUPABASE_ANON_KEY")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const auth=createClient(url,pub,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user},error}=await auth.auth.getUser(token);
  if(error||!user)return out({error:"Staff sign-in required"},401);
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const [staff,roles,access]=await Promise.all([
   db.from("staff_profiles").select("employment_status").eq("user_id",user.id).maybeSingle(),
   db.from("staff_role_assignments").select("id").eq("user_id",user.id).eq("active",true).limit(1),
   db.from("staff_business_access").select("access_level").eq("user_id",user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()
  ]);
  if(staff.error||roles.error||access.error)throw staff.error||roles.error||access.error;
  if(staff.data?.employment_status!=="active"||!roles.data?.length||!access.data)return out({error:"Testing staff access required"},403);
  const data=await req.json().catch(()=>({}));
  const action=String(data.action||"list");
  if(action==="list"){
   const q=await db.from("lab_portal_upgrade_requests").select("id,user_id,current_plan_sku,target_plan_sku,status,created_at,updated_at").order("created_at",{ascending:false}).limit(200);
   if(q.error)throw q.error;
   const users=[...new Set((q.data||[]).map(x=>x.user_id))],names=new Map();
   await Promise.all(users.map(async id=>{const a=await db.auth.admin.getUserById(id);if(!a.error)names.set(id,a.data.user?.email||"");}));
   return out({requests:(q.data||[]).map(x=>({...x,customer_email:names.get(x.user_id)||null}))});
  }
  if(action==="mark_reviewed"){
   if(!["admin","manager","editor"].includes(String(access.data.access_level||"").toLowerCase()))return out({error:"Testing editing access required"},403);
   const id=String(data.id||"");
   if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))return out({error:"Invalid request"},400);
   const change=await db.from("lab_portal_upgrade_requests").update({status:"quoted",updated_at:new Date().toISOString()}).eq("id",id).eq("status","requested").select("id,status").maybeSingle();
   if(change.error)throw change.error;
   if(!change.data)return out({error:"This request has already been reviewed or changed"},409);
   return out({ok:true,status:change.data.status});
  }
  return out({error:"Unsupported action"},400);
 }catch(e){console.error("testing-lab-plan-upgrades",e);return out({error:"Unable to access upgrade requests"},500)}
});
