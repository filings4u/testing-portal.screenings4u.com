import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const ORIGINS=new Set(["https://screenings4u.com","https://www.screenings4u.com","https://testing-portal.screenings4u.com"]);
function reply(body,status=200,origin=""){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","access-control-allow-origin":ORIGINS.has(origin)?origin:"https://screenings4u.com","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version","vary":"Origin"}})}
const clean=(x,max=2000)=>String(x??"").trim().slice(0,max);
const BRAND_LOGO="https://elpbnytpciqnbexiaebp.supabase.co/storage/v1/object/public/enterprise_branding/logo-screenings4u2.png";
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
   let q=db.from("testing_career_jobs").select("id,slug,title,department,location,employment_type,description,requirements,detail_sections").eq("status","published").order("display_order");
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
   const {data:job,error:jobError}=await db.from("testing_career_jobs").select("id,title,slug").eq("id",clean(x.job_id,45)).eq("status","published").maybeSingle();
   if(jobError)throw jobError;
   if(!job)return reply({error:"This position is not accepting applications."},400,origin);
   const details=x.application_details&&typeof x.application_details==="object"&&!Array.isArray(x.application_details)?x.application_details:{};
   if(JSON.stringify(details).length>35000)return reply({error:"Application information exceeds the permitted length."},400,origin);
   if(job.slug==="specimen-collector"||job.slug==="janitorial-associate"){
     const collector=job.slug==="specimen-collector";
     const required=collector?
       ["zip_code","preferred_employment_type","earliest_start_date","days_available","hours_available","sponsorship_required","prior_collection_experience","willing_training","electronic_signature","signature_date"]:
       ["earliest_start_date","days_available","hours_available","sponsorship_required","prior_cleaning_experience","willing_training","schedule_compatibility","essential_duties","electronic_signature","signature_date"];
     const missing=required.filter(k=>!clean(details[k],300));
     if(typeof x.work_authorized!=="boolean")missing.push("work_authorized");
     const acknowledgments=details.acknowledgments||{};
     const expected=collector?["accuracy","no_guarantee","verification","screening_consent","privacy_notice"]:["accuracy","no_guarantee","verification","screening_consent","contact_consent","privacy_notice"];
     for(const key of expected)if(acknowledgments[key]!==true)missing.push("ack_"+key);
     if(!/^\d{4}-\d{2}-\d{2}$/.test(clean(details.signature_date,20))&&!missing.includes("signature_date"))missing.push("signature_date");
     if(clean(details.electronic_signature,150).toLowerCase()!==clean(first+" "+last,150).toLowerCase()&&!missing.includes("electronic_signature"))missing.push("electronic_signature");
     if(missing.length)return reply({error:"Please correct the highlighted fields before submitting.",fields:missing},400,origin);
   }
   const uploadToken=crypto.randomUUID()+"-"+crypto.randomUUID();
   const uploadTokenHash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(uploadToken)).then(b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join(""));
   const candidateId=crypto.randomUUID();
   const storagePath=candidateId+"/resume."+resume.ext;
   const uploaded=await db.storage.from(RESUME_BUCKET).upload(storagePath,resume.bytes,{contentType:resume.mime,upsert:false,cacheControl:"0"});
   if(uploaded.error){console.error("Career resume upload error",uploaded.error);return reply({error:"Could not securely save résumé. Please retry."},500,origin)}
   const inserted=await db.from("testing_career_applications").insert({id:candidateId,job_id:job.id,first_name:first,last_name:last,email,phone,city:clean(x.city,100),state:clean(x.state,100),experience:clean(x.experience,100),availability:clean(x.availability,200),work_authorized:typeof x.work_authorized==="boolean"?x.work_authorized:null,qualifications:clean(x.qualifications,3500),comments:clean(x.comments,2000),consent:true,resume_storage_path:storagePath,resume_file_name:resume.fileName,resume_mime_type:resume.mime,resume_size_bytes:resume.bytes.length,application_details:details,electronic_signature:clean(details.electronic_signature,150)||null,signed_at:details.signature_date?new Date().toISOString():null,acknowledgments:details.acknowledgments||{},applicant_privacy_notice_version:["specimen-collector","janitorial-associate"].includes(job.slug)?"2024-01-01":null,attachment_upload_token_hash:uploadTokenHash,attachment_upload_expires_at:new Date(Date.now()+30*60*1000).toISOString()});
   if(inserted.error){
    await db.storage.from(RESUME_BUCKET).remove([storagePath]);
    throw inserted.error;
   }
   const person=escapeHtml(first),jobName=escapeHtml(job.title);
   const applicantHtml=emailShell("Application received",`<p style="font-size:16px;line-height:1.7">Hello ${person},</p><p style="font-size:16px;line-height:1.7">Thank you for applying for the <strong>${jobName}</strong> position with screenings4u.</p><p style="font-size:16px;line-height:1.7">We received your employment application and résumé. Our hiring team will review your information and contact you if we would like to discuss next steps.</p><p style="font-size:14px;color:#536c86">Submitting an application does not guarantee an interview or employment offer.</p><p style="margin-top:28px">Sincerely,<br><strong>screenings4u Hiring Team</strong></p>`);
   const settings=await db.from("testing_management_settings").select("value").eq("key","careers_notification_email").maybeSingle();
   const configured=typeof settings.data?.value==="string"?settings.data.value:"";
   const adminEmail=clean(configured||Deno.env.get("SCREENINGS4U_CAREERS_ADMIN_EMAIL")||Deno.env.get("SCREENINGS4U_ADMIN_EMAIL"),255);
   const applicantUrl="https://testing-portal.screenings4u.com/career-applicant.html?id="+encodeURIComponent(candidateId);
   const adminHtml=emailShell("New career application",`<p style="font-size:16px;line-height:1.7">A candidate has submitted an application through screenings4u.com.</p><table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px"><tr><td style="padding:12px;border-bottom:1px solid #e3eaf1">Candidate</td><td style="padding:12px;border-bottom:1px solid #e3eaf1"><strong>${escapeHtml(first+" "+last)}</strong></td></tr><tr><td style="padding:12px;border-bottom:1px solid #e3eaf1">Position</td><td style="padding:12px;border-bottom:1px solid #e3eaf1">${jobName}</td></tr><tr><td style="padding:12px;border-bottom:1px solid #e3eaf1">Résumé</td><td style="padding:12px;border-bottom:1px solid #e3eaf1">Attached securely in the staff portal</td></tr></table><p style="margin-top:25px"><a href="${applicantUrl}" style="display:inline-block;background:#ed6b2b;color:white;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Review application securely</a></p><p style="font-size:13px;color:#59708a">Staff sign-in is required to access candidate details and the résumé. Do not forward this message.</p>`);
   const [applicantEmail,adminEmailStatus]=await Promise.all([
     sendCareerMail(db,candidateId,"applicant",email,"We received your application | screenings4u",applicantHtml),
     sendCareerMail(db,candidateId,"admin",adminEmail,"New application: "+job.title+" | screenings4u",adminHtml)
   ]);
   return reply({ok:true,application_id:candidateId,attachment_upload_token:uploadToken,applicant_email_status:applicantEmail,admin_email_status:adminEmailStatus},200,origin);
  }
  if(action==="upload_supporting_document"){
   const applicationId=clean(body.application_id,45),token=clean(body.upload_token,150),kind=clean(body.document_type,35);
   if(!/^[0-9a-f-]{36}$/.test(applicationId)||!token||!["collector_training","alcohol_training","cover_letter","additional_qualification"].includes(kind))return reply({error:"Invalid upload request."},400,origin);
   const {data:application,error:loadError}=await db.from("testing_career_applications").select("id,supporting_documents,attachment_upload_token_hash,attachment_upload_expires_at").eq("id",applicationId).maybeSingle();
   if(loadError)throw loadError;
   const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)).then(b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join(""));
   if(!application||application.attachment_upload_token_hash!==digest||!application.attachment_upload_expires_at||new Date(application.attachment_upload_expires_at).getTime()<Date.now())return reply({error:"Attachment session expired."},403,origin);
   const docs=Array.isArray(application.supporting_documents)?application.supporting_documents:[];
   if(docs.length>=4)return reply({error:"Maximum four supporting documents."},400,origin);
   const file=decodeResume(body.file_base64,body.file_name);
   if("error" in file)return reply({error:file.error.replaceAll("Résumé","Document").replaceAll("résumé","document")},400,origin);
   const docId=crypto.randomUUID(),storagePath=applicationId+"/supporting/"+docId+"."+file.ext;
   const uploaded=await db.storage.from(RESUME_BUCKET).upload(storagePath,file.bytes,{contentType:file.mime,upsert:false,cacheControl:"0"});
   if(uploaded.error)return reply({error:"Unable to save document."},500,origin);
   const record={id:docId,type:kind,file_name:file.fileName,storage_path:storagePath,mime_type:file.mime,size_bytes:file.bytes.length};
   const saved=await db.from("testing_career_applications").update({supporting_documents:[...docs,record],updated_at:new Date().toISOString()}).eq("id",applicationId);
   if(saved.error){await db.storage.from(RESUME_BUCKET).remove([storagePath]);throw saved.error}
   return reply({ok:true,document_id:docId},200,origin);
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
   const {data:app,error}=await db.from("testing_career_applications").select("resume_storage_path,resume_file_name,supporting_documents").eq("id",requested).maybeSingle();
   if(error)throw error;if(!app)return reply({error:"Application not found."},404,origin);
   const docId=clean(body.document_id,45),doc=docId?(Array.isArray(app.supporting_documents)?app.supporting_documents:[]).find((x:any)=>x.id===docId):null;
   if(docId&&!doc)return reply({error:"Document not found."},404,origin);
   const filePath=doc?.storage_path||app.resume_storage_path,fileName=doc?.file_name||app.resume_file_name||"resume";
   if(!filePath)return reply({error:"No document found."},404,origin);
   const signed=await db.storage.from(RESUME_BUCKET).createSignedUrl(filePath,90,{download:fileName});
   if(signed.error)throw signed.error;
   return reply({url:signed.data.signedUrl,expires_in:90},200,origin);
  }
  if(action==="get_careers_settings"){
   const {data,error}=await db.from("testing_management_settings").select("value").eq("key","careers_notification_email").maybeSingle();
   if(error)throw error;
   return reply({notification_email:typeof data?.value==="string"?data.value:"",has_environment_fallback:!!(Deno.env.get("SCREENINGS4U_CAREERS_ADMIN_EMAIL")||Deno.env.get("SCREENINGS4U_ADMIN_EMAIL"))},200,origin);
  }
  if(action==="save_careers_settings"){
   const email=clean(body.notification_email,255);
   if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:"Enter a valid notification email address."},400,origin);
   if(!email)return reply({error:"Enter a recipient for new career applications."},400,origin);
   const {error}=await db.from("testing_management_settings").upsert({key:"careers_notification_email",value:email,updated_by:uid,updated_at:new Date().toISOString()},{onConflict:"key"});
   if(error)throw error;
   return reply({ok:true,notification_email:email},200,origin);
  }
  if(action==="list_invitations"){
   const {data,error}=await db.from("testing_career_invitations")
    .select("id,job_id,recipient_email,recipient_name,status,provider_error,created_at,sent_at,testing_career_jobs(title,slug)")
    .order("created_at",{ascending:false}).limit(100);
   if(error)throw error;
   return reply({invitations:data||[]},200,origin);
  }
  if(action==="send_invitation"){
   const jobId=clean(body.job_id,45),recipient=clean(body.email,255).toLowerCase(),recipientName=clean(body.name,120);
   if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(recipient))return reply({error:"Enter a valid applicant email address."},400,origin);
   if(!/^[0-9a-fA-F-]{36}$/.test(jobId))return reply({error:"Choose a job posting."},400,origin);
   const {data:job,error:jobError}=await db.from("testing_career_jobs").select("id,title,slug,status,location,employment_type").eq("id",jobId).maybeSingle();
   if(jobError)throw jobError;
   if(!job||job.status!=="published")return reply({error:"Only published positions can be sent to applicants."},400,origin);
   const apiKey=Deno.env.get("RESEND_API_KEY")||"";
   if(!apiKey)return reply({error:"Email service is not configured. Please contact the administrator."},503,origin);
   const {data:last,error:lastError}=await db.from("testing_career_invitations").select("id,status,created_at")
    .eq("job_id",job.id).eq("recipient_email",recipient).eq("status","sent").order("created_at",{ascending:false}).limit(1);
   if(lastError)throw lastError;
   if(last?.length&&Date.now()-new Date(last[0].created_at).getTime()<5*60*1000)return reply({error:"An invitation to this applicant for this job was already sent within the last five minutes."},409,origin);
   const applicationUrl="https://screenings4u.com/career-application.html?job="+encodeURIComponent(job.slug);
   const {data:log,error:logError}=await db.from("testing_career_invitations").insert({
    job_id:job.id,recipient_email:recipient,recipient_name:recipientName||null,sent_by:uid,status:"pending",application_url:applicationUrl
   }).select("id").single();
   if(logError)throw logError;
   const salutation=recipientName?"Hello "+escapeHtml(recipientName)+",":"Hello,";
   const bodyHtml=`<p style="font-size:16px;line-height:1.7">${salutation}</p>
<p style="font-size:16px;line-height:1.7">You are invited to apply for the <strong>${escapeHtml(job.title)}</strong> position with screenings4u.</p>
<p style="font-size:15px;line-height:1.7">Review the position details and complete the secure employment application using the link below. You can upload your résumé and any requested supporting documents through the application.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:22px 0;border-collapse:collapse">
<tr><td style="padding:10px 0;border-bottom:1px solid #e3eaf1;color:#637791">Position</td><td style="padding:10px 0;border-bottom:1px solid #e3eaf1;text-align:right;color:#193454;font-weight:bold">${escapeHtml(job.title)}</td></tr>
<tr><td style="padding:10px 0;border-bottom:1px solid #e3eaf1;color:#637791">Location</td><td style="padding:10px 0;border-bottom:1px solid #e3eaf1;text-align:right;color:#193454">${escapeHtml(job.location)}</td></tr>
<tr><td style="padding:10px 0;border-bottom:1px solid #e3eaf1;color:#637791">Employment</td><td style="padding:10px 0;border-bottom:1px solid #e3eaf1;text-align:right;color:#193454">${escapeHtml(job.employment_type)}</td></tr>
</table>
<p style="text-align:center;margin:30px 0"><a href="${applicationUrl}" style="background:#ed6b2b;border-radius:9px;padding:15px 32px;display:inline-block;color:#fff;font-size:16px;font-weight:bold;text-decoration:none">Apply Now</a></p>
<p style="font-size:13px;line-height:1.65;color:#536c86">If the button does not work, open this link:<br><a href="${applicationUrl}" style="color:#24467f;word-break:break-all">${applicationUrl}</a></p>
<p style="font-size:14px;line-height:1.65;color:#536c86">If you did not expect this invitation, you may disregard it. This invitation does not guarantee employment or an interview.</p>
<p style="font-size:15px;line-height:1.6">Sincerely,<br><strong>screenings4u Hiring Team</strong></p>`;
   let status="failed",messageId:null|string=null,providerError="";
   try{
     const response=await fetch("https://api.resend.com/emails",{
       method:"POST",headers:{"authorization":"Bearer "+apiKey,"content-type":"application/json"},
       body:JSON.stringify({
        from:Deno.env.get("SCREENINGS4U_FROM_EMAIL")||"screenings4u <notifications@screenings4u.com>",
        to:[recipient],subject:"Invitation to apply: "+job.title+" | screenings4u",
        html:emailShell("You're invited to apply",bodyHtml)
       }),signal:AbortSignal.timeout(12000)
     });
     const result=await response.json().catch(()=>({}));
     if(response.ok&&result.id){status="sent";messageId=result.id}
     else {providerError=clean(result.message||"Email provider rejected this request.",500);console.error("Career invitation rejected",response.status,providerError)}
   }catch(e){providerError="Unable to connect to email provider.";console.error("Career invitation send failed",e)}
   const {error:updatedError}=await db.from("testing_career_invitations")
     .update({status,provider_message_id:messageId,provider_error:status==="sent"?null:providerError,sent_at:status==="sent"?new Date().toISOString():null})
     .eq("id",log.id);
   if(updatedError)console.error("Career invitation delivery log update failed",updatedError);
   if(status!=="sent")return reply({error:"The email was not accepted by the provider. "+providerError},502,origin);
   return reply({ok:true,invitation_id:log.id,status:"sent",recipient_email:recipient,job_title:job.title,application_url:applicationUrl},200,origin);
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