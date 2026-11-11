import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const ORIGINS=new Set(["https://screenings4u.com","https://www.screenings4u.com","https://testing-portal.screenings4u.com"]);
function reply(body,status=200,origin=""){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","access-control-allow-origin":ORIGINS.has(origin)?origin:"https://screenings4u.com","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization,apikey,content-type","vary":"Origin"}})}
const clean=(x,max=2000)=>String(x??"").trim().slice(0,max);
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return reply({},200,origin);
 if(req.method!=="POST")return reply({error:"Method not allowed"},405,origin);
 if(origin && !ORIGINS.has(origin))return reply({error:"Origin not allowed"},403,origin);
 let body;try{body=await req.json()}catch{return reply({error:"Invalid JSON"},400,origin)}
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const db=createClient(url,secret,{auth:{persistSession:false}});
 const action=clean(body?.action,50);
 try{
  if(action==="list_public"||action==="get_public"){
   let q=db.from("testing_career_jobs").select("id,slug,title,department,location,employment_type,description,requirements").eq("status","published").order("display_order");
   if(action==="get_public")q=q.eq("slug",clean(body.slug,100));
   const {data,error}=await q;if(error)throw error;return reply({jobs:data||[]},200,origin);
  }
  if(action==="apply"){
   const x=body.application||{};
   if(clean(x.website))return reply({ok:true},200,origin);
   const email=clean(x.email,255),first=clean(x.first_name,100),last=clean(x.last_name,100),phone=clean(x.phone,50);
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!first||!last||!phone||!x.consent)return reply({error:"Complete the required application fields."},400,origin);
   const {data:job}=await db.from("testing_career_jobs").select("id").eq("id",clean(x.job_id,45)).eq("status","published").maybeSingle();
   if(!job)return reply({error:"This position is not accepting applications."},400,origin);
   const {error}=await db.from("testing_career_applications").insert({job_id:job.id,first_name:first,last_name:last,email,phone,city:clean(x.city,100),state:clean(x.state,100),experience:clean(x.experience,100),availability:clean(x.availability,200),work_authorized:typeof x.work_authorized==="boolean"?x.work_authorized:null,qualifications:clean(x.qualifications,3500),comments:clean(x.comments,2000),consent:true});
   if(error)throw error;return reply({ok:true},200,origin);
  }
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return reply({error:"Staff login required."},401,origin);
  const authClient=createClient(url,anon,{auth:{persistSession:false}});
  const {data:auth,error:authError}=await authClient.auth.getUser(token);
  if(authError||!auth.user)return reply({error:"Invalid staff session."},401,origin);
  const uid=auth.user.id;
  const [staff,access]=await Promise.all([
   db.from("management_staff").select("status,is_super_admin").eq("user_id",uid).maybeSingle(),
   db.from("management_staff_portal_access").select("portal_code,active,access_level").eq("user_id",uid).eq("active",true)
  ]);
  const allowed=staff.data?.status==="active"&&(staff.data?.is_super_admin||access.data?.some((a:any)=>["testing","testing-portal","testing_portal"].includes(String(a.portal_code).toLowerCase())));
  if(!allowed)return reply({error:"Testing Portal staff access required."},403,origin);
  if(action==="list_jobs"){
   const {data,error}=await db.from("testing_career_jobs").select("*").order("display_order");if(error)throw error;return reply({jobs:data},200,origin);
  }
  if(action==="save_job"){
   const x=body.job||{},obj={slug:clean(x.slug,100),title:clean(x.title,150),department:clean(x.department,100),location:clean(x.location,150),employment_type:clean(x.employment_type,80),description:clean(x.description,5000),requirements:clean(x.requirements,4000),status:clean(x.status,20),display_order:Number(x.display_order)||0,updated_at:new Date().toISOString()};
   if(!obj.slug||!obj.title||!obj.description||!["draft","published","closed","archived"].includes(obj.status))return reply({error:"Invalid job fields"},400,origin);
   const q=x.id?db.from("testing_career_jobs").update(obj).eq("id",x.id):db.from("testing_career_jobs").insert(obj);
   const {data,error}=await q.select().single();if(error)throw error;return reply({job:data},200,origin);
  }
  if(action==="list_applications"){
   const {data,error}=await db.from("testing_career_applications").select("*,testing_career_jobs(title)").order("created_at",{ascending:false}).limit(500);
   if(error)throw error;return reply({applications:data},200,origin);
  }
  if(action==="update_application"){
   const status=clean(body.status,30);
   if(!["new","reviewing","interview","offer","hired","rejected","withdrawn"].includes(status))return reply({error:"Invalid status"},400,origin);
   const {error}=await db.from("testing_career_applications").update({status,internal_notes:clean(body.internal_notes,10000),updated_at:new Date().toISOString()}).eq("id",clean(body.id,50));
   if(error)throw error;return reply({ok:true},200,origin);
  }
  return reply({error:"Unknown action"},400,origin);
 }catch(e){console.error("career function",e);return reply({error:"Unable to complete request."},500,origin)}
});