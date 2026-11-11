import {createClient} from "npm:@supabase/supabase-js@2";
const H={"Access-Control-Allow-Origin":"https://testing-portal.screenings4u.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const send=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:H});
const uid=(x:unknown)=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(x||""));
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(req.method!=="POST")return send({error:"POST required"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,pub=Deno.env.get("SUPABASE_ANON_KEY")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const client=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await client.auth.getUser(token);if(error||!user)return send({error:"Testing staff sign-in required"},401);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const [staff,roles,grant]=await Promise.all([db.from("staff_profiles").select("employment_status").eq("user_id",user.id).maybeSingle(),db.from("staff_role_assignments").select("id").eq("user_id",user.id).eq("active",true).limit(1),db.from("staff_business_access").select("access_level,assigned_customers_only").eq("user_id",user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()]);
  if(staff.error||roles.error||grant.error)throw staff.error||roles.error||grant.error;
  if(staff.data?.employment_status!=="active"||!roles.data?.length||!grant.data||grant.data.assigned_customers_only===true)return send({error:"Full testing staff authorization required"},403);
  const edit=["admin","manager","editor"].includes(String(grant.data.access_level||"").toLowerCase());
  const body=await req.json().catch(()=>({})),action=String(body.action||"list");
  if(action==="list"){
   const [requests,low]=await Promise.all([
    db.from("lab_portal_result_deliveries").select("id,customer_user_id,testing_case_id,recipient_email,recipient_name,status,staff_notes,created_at,completed_at").order("created_at",{ascending:false}).limit(250),
    db.from("lab_portal_supply_alerts").select("id,customer_user_id,supply_name,reorder_threshold,estimated_on_hand,enabled,updated_at").eq("enabled",true).limit(250)
   ]);
   if(requests.error||low.error)throw requests.error||low.error;
   const customers=[...new Set([...(requests.data||[]).map(x=>x.customer_user_id),...(low.data||[]).map(x=>x.customer_user_id)])],emails=new Map();
   await Promise.all(customers.map(async id=>{const x=await db.auth.admin.getUserById(id);if(!x.error)emails.set(id,x.data.user?.email||"")}));
   const ids=[...new Set((requests.data||[]).map(x=>x.testing_case_id))];
   const cases=ids.length?await db.from("testing_cases").select("id,case_number,released_at,customer_user_id").in("id",ids):{data:[],error:null};
   if(cases.error)throw cases.error;
   const caseMap=new Map((cases.data||[]).map(x=>[x.id,x]));
   return send({can_edit:edit,requests:(requests.data||[]).map(x=>({...x,customer_email:emails.get(x.customer_user_id)||"",case_number:caseMap.get(x.testing_case_id)?.case_number||"",is_released:!!caseMap.get(x.testing_case_id)?.released_at,case_owned:caseMap.get(x.testing_case_id)?.customer_user_id===x.customer_user_id})),supply_alerts:(low.data||[]).filter(x=>x.estimated_on_hand<=x.reorder_threshold).map(x=>({...x,customer_email:emails.get(x.customer_user_id)||""}))});
  }
  if(action==="released_cases"){
   const q=await db.from("testing_cases").select("id,case_number,customer_user_id,released_at").not("released_at","is",null).not("customer_user_id","is",null).order("released_at",{ascending:false}).limit(150);
   if(q.error)throw q.error;
   const owners=[...new Set((q.data||[]).map(x=>x.customer_user_id))],emails=new Map<string,string>();
   await Promise.all(owners.map(async id=>{const x=await db.auth.admin.getUserById(id);if(!x.error)emails.set(id,String(x.data.user?.email||""))}));
   return send({cases:(q.data||[]).map(x=>({...x,customer_email:emails.get(x.customer_user_id)||""}))});
  }
  if(!edit)return send({error:"Testing write permissions required"},403);
  if(action==="upload_ccf"){
   const id=String(body.testing_case_id||""),base64=String(body.file_base64||""),filename=String(body.filename||"CCF.pdf").replace(/[^A-Za-z0-9 ._()-]/g,"").slice(0,120);
   if(!uid(id)||!base64||base64.length>8_000_000||!/^[A-Za-z0-9+/=]+$/.test(base64))return send({error:"Valid released case and PDF under 5 MB required"},400);
   const owned=await db.from("testing_cases").select("id,customer_user_id,released_at").eq("id",id).maybeSingle();
   if(owned.error)throw owned.error;
   if(!owned.data||!owned.data.customer_user_id||!owned.data.released_at)return send({error:"Only a released customer-owned case may receive a customer-visible CCF"},403);
   const bytes=Uint8Array.from(atob(base64),ch=>ch.charCodeAt(0));
   if(bytes.length<8||bytes.length>5_242_880||new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")return send({error:"Only PDFs under 5 MB can be released"},400);
   const location="lab-ccf/"+owned.data.customer_user_id+"/"+id+"/"+crypto.randomUUID()+".pdf";
   const upload=await db.storage.from("testing-private-documents").upload(location,bytes,{upsert:false,contentType:"application/pdf",cacheControl:"0"});
   if(upload.error)throw upload.error;
   const doc=await db.from("testing_case_documents").insert({testing_case_id:id,document_type:"ccf",title:filename.toLowerCase().endsWith(".pdf")?filename:filename+".pdf",storage_bucket:"testing-private-documents",storage_path:location,mime_type:"application/pdf",file_size:bytes.length,visibility:"customer",created_by:user.id,metadata:{source:"testing_lab_advanced",issued_at:new Date().toISOString()}}).select("id,testing_case_id").single();
   if(doc.error){await db.storage.from("testing-private-documents").remove([location]);throw doc.error}
   return send({ok:true,document:doc.data});
  }
  if(action==="deliver_portal"){
   const id=String(body.id||"");if(!uid(id))return send({error:"Valid delivery request required"},400);
   const found=await db.from("lab_portal_result_deliveries").select("id,customer_user_id,testing_case_id,recipient_email,recipient_name,status,staff_notes").eq("id",id).maybeSingle();
   if(found.error)throw found.error;
   const request=found.data;
   if(!request||request.status!=="approved"||!request.staff_notes||request.staff_notes.trim().length<10)return send({error:"This recipient must have documented staff authorization before delivery"},409);
   const caseResult=await db.from("testing_cases").select("id,case_number,customer_user_id,released_at").eq("id",request.testing_case_id).eq("customer_user_id",request.customer_user_id).maybeSingle();
   if(caseResult.error)throw caseResult.error;
   if(!caseResult.data?.released_at)return send({error:"The requested MRO result is not released to this Lab Account"},403);
   const profiles=await db.from("user_profiles").select("id,email").ilike("email",request.recipient_email).limit(3);
   if(profiles.error)throw profiles.error;
   if(profiles.data?.length!==1)return send({error:"The authorized recipient must have one verified customer portal account. Configure that account before delivery."},409);
   const recipient=profiles.data[0];
   const identified=await db.auth.admin.getUserById(recipient.id);
   if(identified.error||!identified.data.user?.email_confirmed_at||String(identified.data.user.email||"").toLowerCase()!==String(request.recipient_email||"").toLowerCase())return send({error:"The recipient account email is not verified"},403);
   const active=await db.from("testing_customer_portal_access").select("status").eq("user_id",recipient.id).maybeSingle();
   if(active.error)throw active.error;
   if(!["active","enabled"].includes(String(active.data?.status||"").toLowerCase()))return send({error:"Recipient must have active Testing Customer portal access"},409);
   const documents=await db.from("testing_case_documents").select("id,title,document_type,storage_bucket,storage_path,mime_type,file_size,visibility").eq("testing_case_id",request.testing_case_id).eq("document_type","mro_report").eq("visibility","customer").is("archived_at",null).order("created_at",{ascending:false}).limit(1);
   if(documents.error)throw documents.error;
   const report=documents.data?.[0];
   if(!report||!report.storage_path||!["testing-documents","testing-private-documents"].includes(report.storage_bucket))return send({error:"Released customer-visible MRO PDF is not attached to this case"},409);
   const existing=await db.from("testing_document_deliveries").select("id").eq("recipient_user_id",recipient.id).contains("metadata",{lab_delivery_request_id:id}).limit(1);
   if(existing.error)throw existing.error;
   if(existing.data?.length)return send({error:"This request has already been sent to the verified recipient. Refresh to reconcile status."},409);
   const doc=await db.from("testing_private_documents").insert({title:"Released MRO Report — "+(caseResult.data.case_number||"Testing case"),description:"Authorized result delivery through the customer portal",category:"lab_results",storage_bucket:report.storage_bucket,storage_path:report.storage_path,original_filename:report.title||"MRO-Report.pdf",mime_type:report.mime_type||"application/pdf",file_size:report.file_size,customer_user_id:recipient.id,created_by:user.id,metadata:{origin:"lab_result_delivery",lab_delivery_request_id:id,testing_case_id:request.testing_case_id,source_document_id:report.id}}).select("id").single();
   if(doc.error)throw doc.error;
   const created=await db.from("testing_document_deliveries").insert({source_type:"private_document",source_id:doc.data.id,recipient_user_id:recipient.id,recipient_name:request.recipient_name||null,recipient_email:request.recipient_email,portal_status:"sent",portal_sent_at:new Date().toISOString(),delivered_by:user.id,metadata:{lab_delivery_request_id:id,testing_case_id:request.testing_case_id,lab_customer_user_id:request.customer_user_id,authorization_review:request.staff_notes}}).select("id").single();
   if(created.error){await db.from("testing_private_documents").delete().eq("id",doc.data.id);throw created.error}
   const updated=await db.from("lab_portal_result_deliveries").update({status:"delivered",staff_user_id:user.id,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).eq("status","approved").select("id,status").maybeSingle();
   if(updated.error||!updated.data){
    await db.from("testing_document_deliveries").delete().eq("id",created.data.id);
    await db.from("testing_private_documents").delete().eq("id",doc.data.id);
    throw updated.error||Error("This delivery changed before completion");
   }
   let notified=false;
   const key=Deno.env.get("RESEND_API_KEY")||"",from=Deno.env.get("SCREENINGS4U_FROM_EMAIL")||"";
   if(key&&from){
    const html='<div style="font:15px Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#01122F"><h2>Secure testing document available</h2><p>A released testing document has been shared with your authorized customer portal account.</p><p>For your privacy, the report is not attached to this email. Sign in to your customer portal to view your secure documents.</p><a href="https://customers.screenings4u.com/" style="display:inline-block;background:#01122F;color:#fff;padding:13px 18px;text-decoration:none;border-radius:8px;font-weight:bold">Open secure customer portal</a></div>';
    try{
      const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[request.recipient_email],subject:"Secure testing document available in your portal",html})});
      if(response.ok){notified=true;await db.from("testing_document_deliveries").update({email_status:"sent",email_sent_at:new Date().toISOString()}).eq("id",created.data.id)}else console.warn("Recipient notification failed",response.status);
    }catch(e){console.warn("Recipient notification unavailable",e)}
   }
   return send({ok:true,delivery_status:"delivered",recipient_portal_notified:notified});
  }
  if(action==="review"){
   const id=String(body.id||""),decision=String(body.decision||""),notes=String(body.staff_notes||"").trim().slice(0,1500);
   if(!uid(id)||!["approved","declined"].includes(decision))return send({error:"Invalid decision"},400);
   if(decision==="approved"&&notes.length<10)return send({error:"Document the recipient authorization verification before approving result delivery"},400);
   const row=await db.from("lab_portal_result_deliveries").select("id,customer_user_id,testing_case_id,recipient_email,status").eq("id",id).maybeSingle();
   if(row.error)throw row.error;if(!row.data||row.data.status!=="pending_review")return send({error:"Request no longer pending"},409);
   const testing=await db.from("testing_cases").select("id,customer_user_id,released_at").eq("id",row.data.testing_case_id).eq("customer_user_id",row.data.customer_user_id).maybeSingle();
   if(testing.error)throw testing.error;
   if(!testing.data?.released_at)return send({error:"A testing result must be released to this account before it may be approved"},403);
   const update=await db.from("lab_portal_result_deliveries").update({status:decision,staff_user_id:user.id,staff_notes:notes,updated_at:new Date().toISOString()}).eq("id",id).eq("status","pending_review").select("id,status").maybeSingle();
   if(update.error)throw update.error;if(!update.data)return send({error:"Request already changed"},409);
   return send({ok:true,request:update.data});
  }
  return send({error:"Unsupported action"},400);
 }catch(e){console.error("testing-lab-advanced",e);return send({error:"Unable to load testing feature operations"},500)}
});