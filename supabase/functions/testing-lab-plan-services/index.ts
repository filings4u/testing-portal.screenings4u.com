import {createClient} from "npm:@supabase/supabase-js@2";
const HEAD={"Access-Control-Allow-Origin":"https://testing-portal.screenings4u.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const out=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:HEAD});
const uuid=(s:unknown)=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(s||""));
const states=["submitted","in_review","awaiting_customer","completed","declined"];
const permitted:Record<string,string[]>={submitted:["in_review","awaiting_customer","declined"],in_review:["awaiting_customer","completed","declined"],awaiting_customer:["in_review","declined"],completed:[],declined:[]};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:HEAD,status:204});
 if(req.method!=="POST")return out({error:"POST required"},405);
 try{
 const url=Deno.env.get("SUPABASE_URL")!,pub=Deno.env.get("SUPABASE_ANON_KEY")!,secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await auth.auth.getUser(token);
 if(authError||!user)return out({error:"Testing staff sign-in required"},401);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const [staff,roles,grant]=await Promise.all([
  db.from("staff_profiles").select("employment_status").eq("user_id",user.id).maybeSingle(),
  db.from("staff_role_assignments").select("id").eq("user_id",user.id).eq("active",true).limit(1),
  db.from("staff_business_access").select("access_level,assigned_customers_only").eq("user_id",user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()
 ]);
 if(staff.error||roles.error||grant.error)throw staff.error||roles.error||grant.error;
 if(staff.data?.employment_status!=="active"||!roles.data?.length||!grant.data)return out({error:"Testing staff access required"},403);
 // Restrict staff with assigned-customer-only grants until their assigned-customer mapping is enforced.
 if(grant.data.assigned_customers_only===true)return out({error:"Assigned-customer restrictions require scoped staff access"},403);
 const b=await req.json().catch(()=>({})),action=String(b.action||"list");
 if(action==="list"){
  const q=await db.from("lab_plan_service_requests").select("id,customer_user_id,feature_code,request_type,title,details,status,staff_notes,document_name,created_at,updated_at,fulfilled_at").order("created_at",{ascending:false}).limit(250);
  if(q.error)throw q.error;
  const rows=q.data||[];
  const ids=[...new Set(rows.map((x:any)=>x.customer_user_id))],emails=new Map<string,string>();
  await Promise.all(ids.map(async id=>{const x=await db.auth.admin.getUserById(id);if(!x.error&&x.data.user)emails.set(id,String(x.data.user.email||""))}));
  return out({requests:rows.map((x:any)=>({...x,customer_email:emails.get(x.customer_user_id)||""})),can_edit:["admin","manager","editor"].includes(String(grant.data.access_level||"").toLowerCase())});
 }
 if(!["admin","manager","editor"].includes(String(grant.data.access_level||"").toLowerCase()))return out({error:"Testing write access required"},403);
 const id=String(b.id||"");if(!uuid(id))return out({error:"Valid request ID required"},400);
 const record=await db.from("lab_plan_service_requests").select("id,customer_user_id,status,document_path").eq("id",id).maybeSingle();
 if(record.error)throw record.error;if(!record.data)return out({error:"Request not found"},404);
 if(action==="update"){
  const next=String(b.status||""),notes=String(b.staff_notes||"").trim().slice(0,1500);
  if(!states.includes(next)||!(permitted[record.data.status]||[]).includes(next))return out({error:"Invalid status transition"},409);
  const patch:any={status:next,staff_notes:notes,assigned_staff_user_id:user.id,updated_at:new Date().toISOString()};
  if(next==="completed")patch.fulfilled_at=new Date().toISOString();
  const result=await db.from("lab_plan_service_requests").update(patch).eq("id",id).eq("status",record.data.status).select("id,status").maybeSingle();
  if(result.error)throw result.error;if(!result.data)return out({error:"The request changed. Refresh before updating."},409);
  return out({ok:true,request:result.data});
 }
 if(action==="upload_pdf"){
  if(!["submitted","in_review","awaiting_customer"].includes(record.data.status))return out({error:"This request cannot receive another document"},409);
  const base64=String(b.file_base64||""),filename=String(b.filename||"document.pdf").replace(/[^a-zA-Z0-9 ._()-]/g,"").slice(0,120);
  if(!/^[A-Za-z0-9+/=]+$/.test(base64)||base64.length>8_000_000||!base64.length)return out({error:"PDF must be under 5 MB"},400);
  const bytes=Uint8Array.from(atob(base64),ch=>ch.charCodeAt(0));
  if(bytes.length<8||bytes.length>5_242_880||new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")return out({error:"Only PDF documents up to 5 MB are accepted"},400);
  const path="lab-plan-services/"+record.data.customer_user_id+"/"+id+"/"+crypto.randomUUID()+".pdf";
  const upload=await db.storage.from("testing-private-documents").upload(path,bytes,{contentType:"application/pdf",upsert:false,cacheControl:"0"});
  if(upload.error)throw upload.error;
  const patch={document_bucket:"testing-private-documents",document_path:path,document_name:filename.toLowerCase().endsWith(".pdf")?filename:filename+".pdf",status:"completed",assigned_staff_user_id:user.id,fulfilled_at:new Date().toISOString(),updated_at:new Date().toISOString(),staff_notes:String(b.staff_notes||"").trim().slice(0,1500)};
  const updated=await db.from("lab_plan_service_requests").update(patch).eq("id",id).eq("status",record.data.status).select("id,status,document_name").maybeSingle();
  if(updated.error||!updated.data){
   await db.storage.from("testing-private-documents").remove([path]);
   throw updated.error||Error("Request changed before uploading");
  }
  return out({ok:true,request:updated.data});
 }
 return out({error:"Unsupported action"},400);
 }catch(e){console.error("testing-lab-plan-services",e);return out({error:"Unable to process Lab Account fulfillment"},500)}
});