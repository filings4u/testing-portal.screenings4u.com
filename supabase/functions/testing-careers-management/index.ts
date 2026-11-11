import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const ORIGINS=new Set(["https://screenings4u.com","https://www.screenings4u.com","https://testing-portal.screenings4u.com"]);
function reply(body,status=200,origin=""){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","access-control-allow-origin":ORIGINS.has(origin)?origin:"https://screenings4u.com","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization,apikey,content-type","vary":"Origin"}})}
const clean=(x,max=2000)=>String(x??"").trim().slice(0,max);
const BRAND_LOGO="https://elpbnytpciqnbexiaebp.supabase.co/storage/v1/object/public/enterprise_branding/logo-screenings4u.png";
const RESUME_BUCKET="testing-career-resumes";
const MAX_RESUME_BYTES=5*1024*1024;
const escapeHtml=(x:unknown)=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const emailShell=(heading:string,body:string)=>`<!doctype html><html><body style="margin:0;background:#f2f6fb;font-family:Arial,Helvetica,sans-serif;color:#193454"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:32px 12px;background:#f2f6fb"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#fff;border:1px solid #dbe5f0;border-radius:14px;overflow:hidden"><tr><td style="background:#24467f;padding:28px 35px;text-align:center"><img src="${BRAND_LOGO}" alt="screenings4u" width="210" style="max-width:85%;height:auto;display:inline-block"></td></tr><tr><td style="padding:34px 38px"><h1 style="font-size:25px;color:#193454;margin:0 0 18px">${escapeHtml(heading)}</h1>${body}</td></tr><tr><td style="padding:20px 38px;background:#f5f8fc;color:#637791;font-size:12px">screenings4u Careers · <a href="https://screenings4u.com/careers.html" style="color:#24467f">screenings4u.com/careers.html</a><br>This email relates to an employment application. Please do not reply with sensitive documents.</td></tr></table></td></tr></table></body></html>`;
async function sendCareerMail(db:any,applicationId:string,kind:"applicant"|"admin",recipient:string,subject:string,html:string){
 const field=kind==="applicant"?"applicant_email_status":"admin_email_status";
 const sentField=kind==="applicant"?"applicant_email_sent_at":"admin_email_sent_at";
 if(!recipient){await db.from("testing_career_applications").update({[field]:"not_configured"}).eq("id",applicationId);return "not_configured";}
 const key=Deno.env.get("RESEND_API_KEY")||"";
 if(!key){await db.from("testing_career_applications").update({[field]:"not_configured"}).eq("id",applicationId);return "not_configured";}
 let state="failed",sentAt=null;
 try {
  const result=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"authorization":"Bearer "+key,"content-type":"application/json"},body:JSON.stringify({from:Deno.env.get("SCREENINGS4U_FROM_EMAIL")||"screenings4u <notifications@screenings4u.com>",to:[recipient],subject,html}),signal:AbortSignal.timeout(12000)});
  if(!result.ok){const details=await result.text();console.error("Career notification provider rejected request",kind,result.status,details.slice(0,400));}
  else {state="sent";sentAt=new Date().toISOString();}
 }catch(e){console.error("Career notification delivery error",kind,e)}
 const patch:any={[field]:state};if(sentAt)patch[sentField]=sentAt;
 const saved=await db.from("testing_career_applications").update(patch).eq("id",applicationId);
 if(saved.error)console.error("Could not persist career email delivery state",saved.error);
 return state;
}
function decodeResume(value:unknown,fileName:unknown){
 if(!value||typeof value!=="string")return {error:"Attach a PDF, DOC, or DOCX résumé."} as const;
 const name=clean(fileName,180);
 const ext=name.toLowerCase().split(".").pop();
 if(!["pdf","doc","docx"].includes(ext||""))return {error:"Only PDF, DOC, and DOCX résumés are accepted."} as const;
 if(value.length>Math.ceil(MAX_RESUME_BYTES*4/3)+100)return {error:"Résumé must be 5 MB or smaller."} as const;
 let bytes:Uint8Array;try{const raw=atob(value);bytes=Uint8Array.from(raw,c=>c.charCodeAt(0))}catch{return {error:"The résumé file could not be read."} as const}
 if(bytes.byteLength===0||bytes.byteLength>MAX_RESUME_BYTES)return {error:"Résumé must be between 1 byte and 5 MB."} as const;
 const magic=String.fromCharCode(...bytes.slice(0,8));
 const mime=ext==="pdf"?"application/pdf":ext==="doc"?"application/msword":"application/vnd.openxmlformats-officedocument.wordprocessingml.document";
 if(ext==="pdf"&&!magic.startsWith("%PDF-"))return {error:"The uploaded file is not a valid PDF."} as const;
 if(ext==="doc"&&!magic.startsWith(String.fromCharCode(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1)))return {error:"The uploaded file is not a valid DOC file."} as const;
 if(ext==="docx"&&!magic.startsWith("PK"))return {error:"The uploaded file is not a valid DOCX file."} as const;
 return {bytes,mime,fileName:name,ext} as const;
}

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
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!first||!last||!phone||x.consent!==true)return reply({error:"Complete the required application fields."},400,origin);
   const resume=decodeResume(body.resume_base64,body.resume_file_name);
   if("error" in resume)return reply({error:resume.error},400,origin);
   const {data:job,error:jobError}=await db.from("testing_career_jobs").select("id,title").eq("id",clean(x.job_id,45)).eq("status","published").maybeSingle();
   if(jobError)throw jobError;
   if(!job)return reply({error:"This position is not accepting applications."},400,origin);
   const candidateId=crypto.randomUUID();
   const storagePath=candidateId+"/resume."+resume.ext;
   const uploaded=await db.storage.from(RESUME_BUCKET).upload(storagePath,resume.bytes,{contentType:resume.mime,upsert:false,cacheControl:"0"});
   if(uploaded.error){console.error("Career resume upload error",uploaded.error);return reply({error:"Could not securely save résumé. Please retry."},500,origin)}
   const inserted=await db.from("testing_career_applications").insert({id:candidateId,job_id:job.id,first_name:first,last_name:last,email,phone,city:clean(x.city,100),state:clean(x.state,100),experience:clean(x.experience,100),availability:clean(x.availability,200),work_authorized:typeof x.work_authorized==="boolean"?x.work_authorized:null,qualifications:clean(x.qualifications,3500),comments:clean(x.comments,2000),consent:true,resume_storage_path:storagePath,resume_file_name:resume.fileName,resume_mime_type:resume.mime,resume_size_bytes:resume.bytes.length});
   if(inserted.error){
    await db.storage.from(RESUME_BUCKET).remove([storagePath]);
    throw inserted.error;
   }
   const person=escapeHtml(first),jobName=escapeHtml(job.title);
   const applicantHtml=emailShell("Application received",`<p style="font-size:16px;line-height:1.7">Hello ${person},</p><p style="font-size:16px;line-height:1.7">Thank you for applying for the <strong>${jobName}</strong> position with screenings4u.</p><p style="font-size:16px;line-height:1.7">We received your employment application and résumé. Our hiring team will review your information and contact you if we would like to discuss next steps.</p><p style="font-size:14px;color:#536c86">Submitting an application does not guarantee an interview or employment offer.</p><p style="margin-top:28px">Sincerely,<br><strong>screenings4u Hiring Team</strong></p>`);
   const adminEmail=clean(Deno.env.get("SCREENINGS4U_CAREERS_ADMIN_EMAIL")||Deno.env.get("SCREENINGS4U_ADMIN_EMAIL"),255);
   const applicantUrl="https://testing-portal.screenings4u.com/career-applicant.html?id="+encodeURIComponent(candidateId);
   const adminHtml=emailShell("New career application",`<p style="font-size:16px;line-height:1.7">A candidate has submitted an application through screenings4u.com.</p><table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px"><tr><td style="padding:12px;border-bottom:1px solid #e3eaf1">Candidate</td><td style="padding:12px;border-bottom:1px solid #e3eaf1"><strong>${escapeHtml(first+" "+last)}</strong></td></tr><tr><td style="padding:12px;border-bottom:1px solid #e3eaf1">Position</td><td style="padding:12px;border-bottom:1px solid #e3eaf1">${jobName}</td></tr><tr><td style="padding:12px;border-bottom:1px solid #e3eaf1">Résumé</td><td style="padding:12px;border-bottom:1px solid #e3eaf1">Attached securely in the staff portal</td></tr></table><p style="margin-top:25px"><a href="${applicantUrl}" style="display:inline-block;background:#ed6b2b;color:white;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Review application securely</a></p><p style="font-size:13px;color:#59708a">Staff sign-in is required to access candidate details and the résumé. Do not forward this message.</p>`);
   const [applicantEmail,adminEmailStatus]=await Promise.all([
     sendCareerMail(db,candidateId,"applicant",email,"We received your application | screenings4u",applicantHtml),
     sendCareerMail(db,candidateId,"admin",adminEmail,"New application: "+job.title+" | screenings4u",adminHtml)
   ]);
   return reply({ok:true,application_id:candidateId,applicant_email_status:applicantEmail,admin_email_status:adminEmailStatus},200,origin);
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
  if(action==="resume_url"){
   const requested=clean(body.id,50);
   const {data:app,error}=await db.from("testing_career_applications").select("resume_storage_path,resume_file_name").eq("id",requested).maybeSingle();
   if(error)throw error;if(!app?.resume_storage_path)return reply({error:"No résumé is attached to this application."},404,origin);
   const signed=await db.storage.from(RESUME_BUCKET).createSignedUrl(app.resume_storage_path,90,{download:app.resume_file_name||"resume"});
   if(signed.error)throw signed.error;
   return reply({url:signed.data.signedUrl,expires_in:90},200,origin);
  }
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