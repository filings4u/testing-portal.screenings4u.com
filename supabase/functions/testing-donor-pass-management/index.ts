import {createClient} from "npm:@supabase/supabase-js@2";
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...H,"Content-Type":"application/json","Cache-Control":"no-store"}});
const C=(v:any)=>String(v??"").trim(),N=()=>new Date().toISOString();
const LOGO="https://elpbnytpciqnbexiaebp.supabase.co/storage/v1/object/public/enterprise_branding/logo-screenings4u.png";
const PORTAL="https://customers.screenings4u.com";
async function ctx(req:Request){
 const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token)throw Object.assign(new Error("Authentication required."),{status:401});
 const ac=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}}),db=createClient(url,svc,{auth:{persistSession:false,autoRefreshToken:false}});
 const u=await ac.auth.getUser(token);if(u.error||!u.data.user)throw Object.assign(new Error("Authentication required."),{status:401});
 const [sp,ba]=await Promise.all([
   db.from("staff_profiles").select("employment_status").eq("user_id",u.data.user.id).maybeSingle(),
   db.from("staff_business_access").select("access_level").eq("user_id",u.data.user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()
 ]);
 if(sp.error)throw sp.error;if(ba.error)throw ba.error;
 if(!sp.data||sp.data.employment_status!=="active"||!ba.data)throw Object.assign(new Error("Testing Management access required."),{status:403});
 return {db,user:u.data.user};
}
function html(title:string,body:string,link=PORTAL,button="Open Customer Portal",ref=""){
 const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
 return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f2f5fa;font-family:Arial,Helvetica,sans-serif;color:#263b55"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" style="max-width:600px;background:white;border:1px solid #dce4ef;border-radius:14px"><tr><td style="background:#01122f;border-bottom:4px solid #fdc102;padding:23px 27px"><img src="${LOGO}" width="185" alt="screenings4u" style="display:block;height:auto;border:0"></td></tr><tr><td style="padding:29px 30px 26px"><p style="font-size:11px;letter-spacing:1.4px;color:#a57a00;font-weight:bold;margin:0 0 10px">DONOR PASS NOTIFICATION</p><h1 style="font-size:25px;line-height:1.2;color:#01122f;margin:0 0 17px">${esc(title)}</h1><p style="font-size:14px;line-height:1.75;margin:0 0 19px">${esc(body)}</p>${ref?'<p style="padding:13px 15px;background:#f3f6fa;border-radius:8px;font-size:13px"><span style="font-size:10px;color:#677c95">DONOR PASS REFERENCE</span><br><strong>'+esc(ref)+'</strong></p>':''}<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#fdc102;border-radius:8px"><a href="${esc(link)}" style="display:inline-block;background:#fdc102;color:#01122f;padding:14px 21px;border-radius:8px;font-size:14px;font-weight:bold;text-decoration:none">${esc(button)}</a></td></tr></table><p style="font-size:12px;line-height:1.6;color:#60738d;margin:25px 0 0">Bring a government-issued photo ID and follow the collection instructions on your issued pass.</p></td></tr><tr><td style="padding:19px 30px;background:#fafbfd;border-top:1px solid #e5eaf2;color:#74879f;font-size:11px">This is an automated message about your testing order.<br>© 2026 screenings4u. All rights reserved.</td></tr></table></td></tr></table></body></html>`;
}
async function sendEmail(db:any,user:any,p:any){
 const email=C(p.donor_email); if(!email)return {status:"not_sent"};
 const subject="Your screenings4u Donor Pass is Ready";
 const passUrl=PORTAL+"/donor-pass-details.html?pass="+encodeURIComponent(p.id);
 const text=`Your screenings4u donor pass ${p.pass_number} is ready. Test: ${p.test_type||"Testing"}. Sign in to your customer portal to view and print your pass: ${passUrl}. Bring your government-issued photo ID and follow the collection instructions on your issued pass.`;
 const ev=await db.from("testing_email_events").insert({
   id:crypto.randomUUID(),event_type:"donor_pass",related_entity_type:"donor_pass",related_entity_id:p.id,
   recipient_user_id:p.customer_user_id||null,employer_id:p.employer_id||null,recipient_name:p.donor_name||null,
   recipient_email:email,subject,provider:"resend",status:"queued",created_by:user.id,
   metadata:{kind:"donor_pass",donor_pass_id:p.id,portal_url:PORTAL,brand:"screenings4u"},created_at:N()
 }).select("*").single();if(ev.error)throw ev.error;
 const key=Deno.env.get("RESEND_API_KEY")||""; if(!key){await db.from("testing_email_events").update({status:"failed",error_message:"RESEND_API_KEY not configured"}).eq("id",ev.data.id);return {status:"failed",error:"RESEND_API_KEY not configured"}}
 const rr=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:Deno.env.get("SCREENINGS4U_FROM_EMAIL")||"screenings4u <notifications@screenings4u.com>",to:[email],reply_to:"hello@screenings4u.com",subject,text,html:html("Your donor pass is ready","Your donor pass is issued and available to view or print securely in your customer portal.",passUrl,"View & Print Donor Pass",p.pass_number)})});
 const rb=await rr.json().catch(()=>({}));
 if(!rr.ok){await db.from("testing_email_events").update({status:"failed",error_message:rb.message||("HTTP "+rr.status)}).eq("id",ev.data.id);return {status:"failed",error:rb.message||("HTTP "+rr.status)}}
 await db.from("testing_email_events").update({status:"sent",provider_message_id:rb.id||null,sent_at:N(),error_message:null}).eq("id",ev.data.id);
 return {status:"sent",provider_id:rb.id||null,email_event_id:ev.data.id};
}
async function sendAdminPassEmail(db:any,p:any){
 const email=Deno.env.get("SCREENINGS4U_ADMIN_EMAIL")||"hello@screenings4u.com";
 const ev=await db.from("testing_email_events").insert({id:crypto.randomUUID(),event_type:"donor_pass_admin_issued",related_entity_type:"donor_pass",related_entity_id:p.id,recipient_email:email,subject:"New screenings4u donor pass issued — "+p.pass_number,provider:"resend",status:"queued",metadata:{donor_pass_id:p.id,order_id:p.order_id,brand:"screenings4u"},created_at:N()}).select("id").single();
 if(ev.error){if(ev.error.code==="23505")return {status:"already_sent"};throw ev.error}
 const key=Deno.env.get("RESEND_API_KEY")||"";
 if(!key){await db.from("testing_email_events").update({status:"failed",error_message:"Email service unavailable"}).eq("id",ev.data.id);return {status:"failed"}}
 const escape=(s:any)=>String(s??"").replace(/[&<>"']/g,(a:any)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[a]||a));
 const title="New donor pass issued",msg="Donor pass "+p.pass_number+" has been issued for "+(p.donor_name||"a donor")+". Order: "+(p.order_id||"not linked")+".";
 const htmlBody=html("New donor pass issued","A donor pass has been issued. Open the Testing Management record to verify details and delivery.", "https://testing-portal.screenings4u.com/donor-pass.html?id="+encodeURIComponent(p.id),"View Donor Pass Record",p.pass_number);
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":"s4u-admin-donor-pass-"+p.id},body:JSON.stringify({from:Deno.env.get("SCREENINGS4U_FROM_EMAIL")||"screenings4u <notifications@screenings4u.com>",to:[email],subject:"New screenings4u donor pass issued — "+p.pass_number,text:msg,html:htmlBody})});
 const data=await response.json().catch(()=>({}));const status=response.ok?"sent":"failed";
 await db.from("testing_email_events").update({status,provider_message_id:data.id||null,error_message:response.ok?null:String(data.message||"Send failed"),sent_at:response.ok?N():null}).eq("id",ev.data.id);
 return {status};
}
async function inApp(db:any,p:any){
 if(!p.customer_user_id)return null;
 const q=await db.from("notifications").insert({id:crypto.randomUUID(),recipient_user_id:p.customer_user_id,employer_id:p.employer_id||null,channel:"in_app",status:"queued",subject:"Your screenings4u Donor Pass is Ready",body:`Your donor pass ${p.pass_number} is ready.`,metadata:{kind:"donor_pass",donor_pass_id:p.id},created_at:N()}).select("*").single();
 if(q.error)throw q.error;return q.data;
}
async function getPass(db:any,id:string){
 const q=await db.from("testing_donor_passes").select("*").eq("id",id).maybeSingle();if(q.error)throw q.error;if(!q.data)throw Object.assign(new Error("Donor pass not found."),{status:404});
 const labcorpId=C(q.data.metadata?.labcorp_order_id)||null;
 const [caseQ,orderQ,profileQ,emails,notes,labcorpQ]=await Promise.all([
   q.data.testing_case_id?db.from("testing_cases").select("*").eq("id",q.data.testing_case_id).maybeSingle():Promise.resolve({data:null,error:null}),
   q.data.order_id?db.from("orders").select("*").eq("id",q.data.order_id).maybeSingle():Promise.resolve({data:null,error:null}),
   q.data.customer_user_id?db.from("user_profiles").select("*").eq("id",q.data.customer_user_id).maybeSingle():Promise.resolve({data:null,error:null}),
   db.from("testing_email_events").select("*").eq("related_entity_type","donor_pass").eq("related_entity_id",id).order("created_at",{ascending:false}),
   q.data.testing_case_id?db.from("testing_case_events").select("*").eq("testing_case_id",q.data.testing_case_id).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
   labcorpId?db.from("testing_labcorp_orders").select("*").eq("id",labcorpId).maybeSingle():(q.data.testing_case_id?db.from("testing_labcorp_orders").select("*").eq("testing_case_id",q.data.testing_case_id).order("created_at",{ascending:false}).limit(1).maybeSingle():Promise.resolve({data:null,error:null}))
 ]);
 for(const x of [caseQ,orderQ,profileQ,emails,notes,labcorpQ])if(x.error)throw x.error;
 return {donor_pass:q.data,case:caseQ.data||null,order:orderQ.data||null,profile:profileQ.data||null,email_events:emails.data||[],case_events:notes.data||[],labcorp_order:labcorpQ.data||null};
}
async function log(db:any,p:any,userId:string,type:string,meta:any={}){
 if(!p.testing_case_id)return;
 const c=await db.from("testing_cases").select("status").eq("id",p.testing_case_id).maybeSingle();if(c.error)throw c.error;
 const q=await db.from("testing_case_events").insert({id:crypto.randomUUID(),testing_case_id:p.testing_case_id,event_type:type,from_status:c.data?.status||null,to_status:c.data?.status||null,actor_user_id:userId,metadata:{donor_pass_id:p.id,pass_number:p.pass_number,...meta},created_at:N()});if(q.error)throw q.error;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:H});
 if(req.method!=="POST")return J({error:"Method not allowed."},405);
 try{
  const {db,user}=await ctx(req),b=await req.json().catch(()=>({})),a=C(b.action||"list");
  if(a==="list"){
    const q=await db.from("testing_donor_passes").select("*").order("created_at",{ascending:false}).limit(5000);if(q.error)throw q.error;
    return J({donor_passes:q.data||[]});
  }
  if(a==="options"){
    const [cases,sites]=await Promise.all([
      db.from("testing_cases").select("id,case_number,order_id,employer_id,customer_user_id,customer_name,customer_email,company_name,donor_name,donor_email,donor_phone,test_reason,test_type,specimen_type,panel_name,dot_test,dot_agency,collection_deadline,collection_site_id,status").not("status","in","(completed,cancelled)").order("created_at",{ascending:false}).limit(3000),
      db.from("compliance_collection_sites").select("*").eq("status","active").order("name")
    ]);if(cases.error)throw cases.error;if(sites.error)throw sites.error;return J({cases:cases.data||[],collection_sites:sites.data||[]});
  }
  if(a==="get"){const id=C(b.id||b.donor_pass_id);if(!id)return J({error:"Donor pass id is required."},400);return J(await getPass(db,id));}
  if(a==="registered_labcorp_options"){
    const q=await db.from("testing_labcorp_orders").select("id,order_id,testing_case_id,labcorp_order_number,labcorp_registration_number,donor_first_name,donor_last_name,status,registration_expiration_at").not("labcorp_registration_number","is",null).in("status",["registered","collection_completed","received_at_lab","resulted","mro_released"]).order("created_at",{ascending:false}).limit(500);
    if(q.error)throw q.error;
    const ids=(q.data||[]).map((x:any)=>x.testing_case_id).filter(Boolean);
    const existing=ids.length?await db.from("testing_donor_passes").select("testing_case_id").in("testing_case_id",ids).neq("status","void"): {data:[],error:null};
    if(existing.error)throw existing.error;
    const used=new Set((existing.data||[]).map((x:any)=>x.testing_case_id));
    return J({labcorp_orders:(q.data||[]).filter((x:any)=>!x.testing_case_id||!used.has(x.testing_case_id))});
  }
  if(a==="create_from_labcorp"){
    const labId=C(b.labcorp_order_id);
    if(!/^[0-9a-f-]{36}$/i.test(labId))return J({error:"Valid Labcorp order ID is required."},400);
    const q=await db.from("testing_labcorp_orders").select("*").eq("id",labId).maybeSingle();
    if(q.error)throw q.error;
    const lab=q.data;
    if(!lab)return J({error:"Labcorp order not found."},404);
    if(!lab.labcorp_registration_number||lab.status==="draft")return J({error:"A successful Labcorp registration is required."},409);
    const existing=await db.from("testing_donor_passes").select("id,pass_number,status").contains("metadata",{labcorp_order_id:lab.id}).order("created_at",{ascending:false}).limit(1);
    if(existing.error)throw existing.error;
    if(existing.data?.length)return J({donor_pass:existing.data[0],existing:true});
    if(lab.testing_case_id){const casePass=await db.from("testing_donor_passes").select("id,pass_number,status").eq("testing_case_id",lab.testing_case_id).neq("status","void").limit(1);if(casePass.error)throw casePass.error;if(casePass.data?.length)return J({donor_pass:casePass.data[0],existing:true});}

    const authority=C(lab.testing_authority).toUpperCase(),dot=["FMCSA","FAA","FRA","FTA","PHMSA","USCG"].includes(authority);
    const row={id:crypto.randomUUID(),status:"draft",testing_case_id:lab.testing_case_id||null,order_id:lab.order_id||null,employer_id:lab.employer_id||null,customer_user_id:lab.customer_user_id||null,donor_name:[lab.donor_first_name,lab.donor_middle_initial,lab.donor_last_name].filter(Boolean).join(" "),donor_email:lab.donor_email||null,donor_phone:lab.donor_phone||null,test_reason:lab.donor_reason_for_test||null,test_type:dot?"DOT Drug Test":"Non-DOT Drug Test",specimen_type:lab.metadata?.service?.toLowerCase().includes("hair")?"Hair":"Urine",panel_name:(lab.panel_ids||[]).join(", "),dot_test:dot,dot_agency:dot?authority:null,collection_site_name:lab.collection_site_name||null,collection_site_address:lab.collection_site_address||null,collection_deadline:lab.registration_expiration_at||null,confirmation_code:String(lab.labcorp_registration_number),instructions:"Present this pass and a valid photo ID at the collection location.",metadata:{source:"labcorp_ots",labcorp_order_id:lab.id,labcorp_order_number:lab.labcorp_order_number,labcorp_registration_number:lab.labcorp_registration_number,labcorp_status:lab.status},created_at:N(),updated_at:N()};
    const created=await db.from("testing_donor_passes").insert(row).select("*").single();
    if(created.error)throw created.error;
    await log(db,created.data,user.id,"donor_pass_created",{labcorp_order_id:lab.id});
    return J({donor_pass:created.data,existing:false});
  }
  if(a==="create"||a==="save"){
    const id=a==="save"?C(b.id||b.donor_pass_id):"",caseId=C(b.testing_case_id)||null;
    if(a==="create"&&caseId){const duplicate=await db.from("testing_donor_passes").select("id,pass_number,status").eq("testing_case_id",caseId).neq("status","void").limit(1);if(duplicate.error)throw duplicate.error;if(duplicate.data?.length)return J({error:"A donor pass already exists for this testing case. Edit or issue the existing pass instead.",existing_pass:duplicate.data[0]},409)}
    let c:any=null;if(caseId){const q=await db.from("testing_cases").select("*").eq("id",caseId).maybeSingle();if(q.error)throw q.error;if(!q.data)return J({error:"Testing case not found."},404);c=q.data}
    let site:any=null;const siteId=C(b.collection_site_id)||c?.collection_site_id||null;if(siteId){const q=await db.from("compliance_collection_sites").select("*").eq("id",siteId).maybeSingle();if(q.error)throw q.error;site=q.data||null}
    const donor=C(b.donor_name)||c?.donor_name||c?.customer_name;if(!donor)return J({error:"Donor name is required."},400);
    const testType=C(b.test_type)||c?.test_type;if(!testType)return J({error:"Test type is required."},400);
    const current=id?await db.from("testing_donor_passes").select("*").eq("id",id).maybeSingle():{data:null,error:null};if(current.error)throw current.error;if(id&&!current.data)return J({error:"Donor pass not found."},404);
    const addr=site?[site.address_line_1,site.address_line_2,site.city,site.state,site.postal_code].filter(Boolean).join(", "):C(b.collection_site_address)||current.data?.collection_site_address||null;
    const row:any={testing_case_id:caseId,order_id:C(b.order_id)||c?.order_id||current.data?.order_id||null,work_order_id:C(b.work_order_id)||current.data?.work_order_id||null,employer_id:C(b.employer_id)||c?.employer_id||current.data?.employer_id||null,customer_user_id:C(b.customer_user_id)||c?.customer_user_id||current.data?.customer_user_id||null,donor_name:donor,donor_email:C(b.donor_email)||c?.donor_email||c?.customer_email||current.data?.donor_email||null,donor_phone:C(b.donor_phone)||c?.donor_phone||current.data?.donor_phone||null,company_name:C(b.company_name)||c?.company_name||current.data?.company_name||null,test_reason:C(b.test_reason)||c?.test_reason||current.data?.test_reason||null,test_type:testType,specimen_type:C(b.specimen_type)||c?.specimen_type||current.data?.specimen_type||null,panel_name:C(b.panel_name)||c?.panel_name||current.data?.panel_name||null,dot_test:Object.prototype.hasOwnProperty.call(b,"dot_test")?Boolean(b.dot_test):Boolean(c?.dot_test||current.data?.dot_test),dot_agency:C(b.dot_agency)||c?.dot_agency||current.data?.dot_agency||null,collection_site_name:site?.name||C(b.collection_site_name)||current.data?.collection_site_name||null,collection_site_address:addr,collection_deadline:b.collection_deadline||c?.collection_deadline||current.data?.collection_deadline||null,confirmation_code:C(b.confirmation_code)||current.data?.confirmation_code||null,instructions:C(b.instructions)||current.data?.instructions||null,updated_at:N()};
    let saved:any;if(id){const q=await db.from("testing_donor_passes").update(row).eq("id",id).select("*").single();if(q.error)throw q.error;saved=q.data}else{const q=await db.from("testing_donor_passes").insert({id:crypto.randomUUID(),...row,status:"draft",created_at:N()}).select("*").single();if(q.error)throw q.error;saved=q.data}
    await log(db,saved,user.id,a==="create"?"donor_pass_created":"donor_pass_updated");return J({donor_pass:saved});
  }
  if(a==="attach_official_labcorp_pdf"){
    const passId=C(b.id||b.donor_pass_id);
    if(!/^[0-9a-f-]{36}$/i.test(passId))return J({error:"Invalid donor pass ID"},400);
    const match=await getPass(db,passId),pass=match.donor_pass,lab=match.labcorp_order;
    if(pass.status!=="draft"||!pass.customer_user_id||!pass.order_id||!lab?.labcorp_registration_number)return J({error:"A registered draft with a linked customer and order is required."},409);
    if(pass.metadata?.official_labcorp_pdf_path)return J({error:"Official Labcorp PDF already attached."},409);
    if(C(b.registration_number)!==String(lab.labcorp_registration_number))return J({error:"Registration number does not match the donor pass."},409);
    const encoded=C(b.pdf_base64);
    if(!encoded||encoded.length>7000000)return J({error:"Original PDF must be 5 MB or less."},400);
    let bytes:Uint8Array;
    try{bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))}catch{return J({error:"Invalid PDF data"},400)}
    if(bytes.length<100||bytes.length>5000000||String.fromCharCode(...bytes.subarray(0,5))!=="%PDF-")return J({error:"Upload a valid PDF under 5 MB."},400);
    const filePath="donor-passes/"+pass.customer_user_id+"/"+pass.id+"/labcorp-registration-"+lab.labcorp_registration_number+".pdf";
    const u=await db.storage.from("testing-private-documents").upload(filePath,bytes,{contentType:"application/pdf",upsert:false});
    if(u.error)throw u.error;
    const now=N();
    const up=await db.from("testing_donor_passes").update({metadata:{...(pass.metadata||{}),official_labcorp_pdf_bucket:"testing-private-documents",official_labcorp_pdf_path:filePath,official_labcorp_registration:String(lab.labcorp_registration_number),official_labcorp_pdf_attached_at:now},updated_at:now}).eq("id",passId).eq("status","draft").select("id").maybeSingle();
    if(up.error)throw up.error;
    if(!up.data)return J({error:"PDF stored but donor pass changed; contact support."},409);
    await log(db,pass,user.id,"official_labcorp_pdf_attached",{registration_number:String(lab.labcorp_registration_number)});
    return J({ok:true,attached:true,donor_pass_id:passId});
  }
  if(a==="issue"||a==="resend"){
    const id=C(b.id||b.donor_pass_id);if(!id)return J({error:"Donor pass id is required."},400);const full=await getPass(db,id),p=full.donor_pass,t=N(),lab=full.labcorp_order;
    if(a==="issue"&&lab&&!lab.labcorp_registration_number)return J({error:"Labcorp registration must be created before this donor pass can be issued."},409);if(a==="issue"&&lab?.registration_expiration_at&&new Date(lab.registration_expiration_at).getTime()<=Date.now())return J({error:"Labcorp registration has expired. Obtain a new registration before issuing a donor pass."},409);if(lab&&!(p.collection_site_address||lab.collection_site_address))return J({error:"Assign a verified Labcorp collection site before issuing or emailing this donor pass."},409);
    if(a==="issue"&&lab?.metadata?.manual_registration_source==="labcorp_website"&&!p.metadata?.official_labcorp_pdf_path)return J({error:"Attach the original Labcorp PDF before issuing the manually created registration."},409);
    let saved=p;if(a==="issue"){const patch:any={status:"issued",issued_by:user.id,issued_at:p.issued_at||t,pushed_to_portal_at:p.customer_user_id?t:p.pushed_to_portal_at,updated_at:t};if(lab){patch.confirmation_code=p.confirmation_code||String(lab.labcorp_registration_number||"");patch.collection_site_name=p.collection_site_name||lab.collection_site_name||null;patch.collection_site_address=p.collection_site_address||lab.collection_site_address||null;patch.collection_deadline=p.collection_deadline||lab.registration_expiration_at||null;patch.metadata={...(p.metadata||{}),labcorp_order_id:lab.id,labcorp_order_number:lab.labcorp_order_number,labcorp_registration_number:lab.labcorp_registration_number,labcorp_status:lab.status};}
    const q=await db.from("testing_donor_passes").update(patch).eq("id",id).select("*").single();if(q.error)throw q.error;saved=q.data;if(saved.testing_case_id){const c=await db.from("testing_cases").select("*").eq("id",saved.testing_case_id).maybeSingle();if(c.error)throw c.error;if(c.data&&!["released","completed","cancelled"].includes(String(c.data.status))){const up=await db.from("testing_cases").update({donor_pass_number:saved.pass_number,status:"ready_for_collection",updated_at:t}).eq("id",saved.testing_case_id);if(up.error)throw up.error}}}
    const app=await inApp(db,saved),email=await sendEmail(db,user,saved);let adminEmail={status:"not_requested"};if(a==="issue"){try{adminEmail=await sendAdminPassEmail(db,saved)}catch(err){console.error("Admin donor pass email failed",String(err))}}if(email.status==="sent"){const up=await db.from("testing_donor_passes").update({email_notified_at:t,updated_at:t}).eq("id",id);if(up.error)throw up.error}
    await log(db,saved,user.id,a==="issue"?"donor_pass_issued":"donor_pass_resent",{email_status:email.status,in_app_notification_id:app?.id||null});return J({ok:true,donor_pass:saved,email_delivery:email,in_app_notification:app});
  }
  if(a==="void"){
    const id=C(b.id||b.donor_pass_id),reason=C(b.reason);if(!id||!reason)return J({error:"Void reason is required."},400);const p=(await getPass(db,id)).donor_pass;
    const q=await db.from("testing_donor_passes").update({status:"void",metadata:{...(p.metadata||{}),void_reason:reason,voided_by:user.id,voided_at:N()},updated_at:N()}).eq("id",id).select("*").single();if(q.error)throw q.error;await log(db,q.data,user.id,"donor_pass_voided",{reason});return J({donor_pass:q.data});
  }
  return J({error:"Unsupported Testing donor pass action."},400);
 }catch(e:any){console.error("testing-donor-pass-management",e);return J({error:e instanceof Error?e.message:String(e)},Number(e?.status||500))}
});