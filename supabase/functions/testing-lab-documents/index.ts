import {createClient} from "npm:@supabase/supabase-js@2";
const H={"Access-Control-Allow-Origin":"https://testing-portal.screenings4u.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const out=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:H});
const uuid=(s:unknown)=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(s||""));
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(req.method!=="POST")return out({error:"POST required"},405);
 try{
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const token=String(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user?.email_confirmed_at)return out({error:"Testing staff sign-in required"},401);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const [staff,roles,grant]=await Promise.all([
 db.from("staff_profiles").select("employment_status").eq("user_id",user.id).maybeSingle(),
 db.from("staff_role_assignments").select("id").eq("user_id",user.id).eq("active",true).limit(1),
 db.from("staff_business_access").select("access_level,assigned_customers_only").eq("user_id",user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()
 ]);
 if(staff.error||roles.error||grant.error)throw staff.error||roles.error||grant.error;
 if(staff.data?.employment_status!=="active"||!roles.data?.length||!grant.data||grant.data.assigned_customers_only===true)return out({error:"Testing staff access required"},403);
 const canEdit=["admin","manager","editor"].includes(String(grant.data.access_level||"").toLowerCase());
 const body=await req.json().catch(()=>({})),action=String(body.action||"list");
 if(action==="list"){
  const customer=String(body.customer_email||"").trim().toLowerCase();
  let q=db.from("lab_customer_published_documents").select("id,customer_user_id,title,description,category,original_filename,file_size,is_published,created_at").is("archived_at",null).order("created_at",{ascending:false}).limit(250);
  if(customer){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer))return out({error:"Invalid customer email"},400);
    const account=await db.from("user_profiles").select("id").ilike("email",customer).maybeSingle();
    if(account.error)throw account.error;
    if(!account.data)return out({documents:[],can_edit:canEdit});
    q=q.eq("customer_user_id",account.data.id);
  }
  const records=await q;if(records.error)throw records.error;
  const ids=[...new Set((records.data||[]).map(x=>x.customer_user_id))],emails=new Map<string,string>();
  await Promise.all(ids.map(async id=>{const x=await db.auth.admin.getUserById(id);if(!x.error&&x.data.user)emails.set(id,String(x.data.user.email||""))}));
  return out({documents:(records.data||[]).map(x=>({...x,customer_email:emails.get(x.customer_user_id)||""})),can_edit:canEdit});
 }
 if(!canEdit)return out({error:"Testing staff editor permissions required"},403);
 if(action==="publish"){
  const email=String(body.customer_email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return out({error:"Valid existing customer email required"},400);
  const matched=await db.from("user_profiles").select("id,email").ilike("email",email).limit(2);
  if(matched.error)throw matched.error;
  if(matched.data?.length!==1)return out({error:"Customer account not found or ambiguous"},404);
  const customerResult=await db.auth.admin.getUserById(matched.data[0].id);
  if(customerResult.error||!customerResult.data.user)return out({error:"Verified customer not found"},404);
  const customer=customerResult.data.user;
  if(String(customer.email||"").trim().toLowerCase()!==email)return out({error:"Customer email verification mismatch"},403);
  if(!customer.email_confirmed_at)return out({error:"Customer must verify email before documents are shared"},403);
  const entitlement=await db.from("testing_customer_portal_access").select("status").eq("user_id",customer.id).maybeSingle();
  if(entitlement.error)throw entitlement.error;
  if(entitlement.data?.status!=="active")return out({error:"Customer portal access is not active"},403);
  const [intakes,grant]=await Promise.all([
   db.from("lab_account_intakes").select("id").or("customer_user_id.eq."+customer.id+",customer_email.eq."+email.replace(/[^a-z0-9@._+\\-]/g,"")).limit(1),
   db.from("testing_customer_portal_access").select("metadata").eq("user_id",customer.id).maybeSingle()
  ]);
  if(intakes.error||grant.error)throw intakes.error||grant.error;
  if(!intakes.data?.length&&grant.data?.metadata?.lab_account_customer_test_access!==true&&grant.data?.metadata?.lab_account_customer_preview!==true)return out({error:"This customer has no verified Lab Account association"},403);
  const title=String(body.title||"").trim().slice(0,180),description=String(body.description||"").trim().slice(0,1000);
  const category=String(body.category||"");
  if(title.length<3||!["account","how_to","compliance","supplies"].includes(category))return out({error:"Title and document category required"},400);
  const encoded=String(body.file_base64||"");
  if(!encoded||encoded.length>14_000_000||!/^[A-Za-z0-9+/=]+$/.test(encoded))return out({error:"Invalid PDF or file too large"},400);
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  if(bytes.length<8||bytes.length>10_485_760||new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")return out({error:"Upload a valid PDF under 10 MB"},400);
  const id=crypto.randomUUID(),path="lab-account-documents/"+customer.id+"/"+id+".pdf";
  const upload=await db.storage.from("testing-private-documents").upload(path,bytes,{upsert:false,contentType:"application/pdf",cacheControl:"0"});
  if(upload.error)throw upload.error;
  const filename=String(body.filename||"Workforce-Document.pdf").replace(/[^A-Za-z0-9 ._()-]/g,"").slice(0,130)||"Workforce-Document.pdf";
  const result=await db.from("lab_customer_published_documents").insert({id,customer_user_id:customer.id,title,description,category,storage_bucket:"testing-private-documents",storage_path:path,original_filename:filename.toLowerCase().endsWith(".pdf")?filename:filename+".pdf",file_size:bytes.length,mime_type:"application/pdf",is_published:true,created_by:user.id}).select("id").single();
  if(result.error){await db.storage.from("testing-private-documents").remove([path]);throw result.error}
  return out({ok:true,id});
 }
 if(action==="archive"||action==="visibility"){
  if(!uuid(body.id))return out({error:"Document ID invalid"},400);
  const patch=action==="archive"?{archived_at:new Date().toISOString(),updated_at:new Date().toISOString()}:{is_published:body.is_published===true,updated_at:new Date().toISOString()};
  const result=await db.from("lab_customer_published_documents").update(patch).eq("id",body.id).is("archived_at",null).select("id").maybeSingle();
  if(result.error)throw result.error;if(!result.data)return out({error:"Document not found"},404);
  return out({ok:true});
 }
 return out({error:"Unsupported action"},400);
 }catch(err){console.error("testing-lab-documents",err);return out({error:"Unable to process customer document"},500)}
});