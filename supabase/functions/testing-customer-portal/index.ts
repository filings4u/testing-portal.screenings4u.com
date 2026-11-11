import { createClient } from "npm:@supabase/supabase-js@2";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:any)=>String(v??"").trim();
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 if(req.method!=="POST")return J({error:"Method not allowed."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return J({error:"Authentication required."},401);
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:ud,error:ue}=await auth.auth.getUser(token);
  if(ue||!ud.user)return J({error:"Authentication required."},401);
  const uid=ud.user.id;
  const access=await db.from("testing_customer_portal_access").select("*").eq("user_id",uid).maybeSingle();
  if(access.error)throw access.error;
  if(!access.data||!["active","enabled"].includes(String(access.data.status||"").toLowerCase()))return J({error:"Customer portal access is not active."},403);
  const body=await req.json().catch(()=>({})),action=String(body.action||"context").toLowerCase();

  if(action==="physicals"){
    // Account-authorized recipient scope only: direct customer user or their actively managed employer organization.
    const memberships=await db.from("organization_memberships").select("organization_id,membership_role").eq("user_id",uid).eq("status","active");
    if(memberships.error)throw memberships.error;
    const ownerOrgIds=(memberships.data||[]).filter((x:any)=>["owner","admin","administrator"].includes(String(x.membership_role||"").toLowerCase())).map((x:any)=>x.organization_id);
    const er=ownerOrgIds.length?await db.from("employers").select("id").in("organization_id",ownerOrgIds).is("archived_at",null):{data:[],error:null};
    if(er.error)throw er.error;
    const employerIds=(er.data||[]).map((x:any)=>x.id);
    if(ud.user.email&&ud.user.email_confirmed_at){
      const paid=await db.from("orders").select("id").ilike("customer_email",ud.user.email).eq("payment_status","paid");
      if(paid.error)throw paid.error;
      for(const order of paid.data||[]){
        const rec=await db.from("occupational_health_orders").update({customer_user_id:uid,updated_at:new Date().toISOString()}).eq("source_type","website").is("customer_user_id",null).contains("metadata",{source_order_id:order.id});
        if(rec.error)throw rec.error;
      }
    }
    const byCustomer=await db.from("occupational_health_orders").select("*").eq("customer_user_id",uid).eq("recipient_portal","customer").is("archived_at",null);
    if(byCustomer.error)throw byCustomer.error;
    const byEmployer=employerIds.length?await db.from("occupational_health_orders").select("*").in("employer_id",employerIds).eq("recipient_portal","employer").is("archived_at",null):{data:[],error:null};
    if(byEmployer.error)throw byEmployer.error;
    const map=new Map<string,any>();for(const x of [...(byCustomer.data||[]),...(byEmployer.data||[])])map.set(x.id,x);
    const orders=[...map.values()].sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at)));
    const passIds=orders.map((x:any)=>x.donor_pass_id).filter(Boolean);
    const pq=passIds.length?await db.from("testing_donor_passes").select("id,pass_number,status,donor_name,company_name,collection_site_name,collection_site_address,confirmation_code,instructions,issued_at").in("id",passIds).eq("status","issued"):{data:[],error:null};
    if(pq.error)throw pq.error;
    return J({physicals:orders.map((x:any)=>({id:x.id,reference_number:x.reference_number,physical_type:x.physical_type,exam_type:x.exam_type,donor_name:x.donor_name,company_name:x.company_name,status:x.status,recipient_portal:x.recipient_portal,created_at:x.created_at,donor_pass:(pq.data||[]).find((v:any)=>v.id===x.donor_pass_id)||null}))});
  }

  if(action==="physical_assign_donor"){
    const id=clean(body.physical_id),donor=clean(body.donor_name),donorEmail=clean(body.donor_email),donorPhone=clean(body.donor_phone);
    if(!id||donor.length<2)return J({error:"Select a physical and provide the donor's full name."},400);
    const q=await db.from("occupational_health_orders").select("*").eq("id",id).is("archived_at",null).maybeSingle();
    if(q.error)throw q.error;
    const x=q.data;if(!x)return J({error:"Physical not found."},404);
    let permitted=x.customer_user_id===uid&&x.recipient_portal==="customer";
    if(!permitted&&x.recipient_portal==="employer"&&x.employer_id){
      const eq=await db.from("employers").select("organization_id").eq("id",x.employer_id).maybeSingle();if(eq.error)throw eq.error;
      if(eq.data?.organization_id){
        const m=await db.from("organization_memberships").select("id").eq("user_id",uid).eq("organization_id",eq.data.organization_id).eq("status","active").in("membership_role",["owner","admin","administrator"]).limit(1);
        if(m.error)throw m.error;permitted=!!m.data?.length;
      }
    }
    if(!permitted)return J({error:"This physical belongs to a different customer account."},403);
    if(x.status!=="draft"||x.testing_case_id)return J({error:"Donor assignment is locked after submission."},409);
    const now=new Date().toISOString(),caseId=crypto.randomUUID(),caseNo="TST-"+crypto.randomUUID().replaceAll("-","").slice(0,10).toUpperCase();
    const employer=x.employer_id?await db.from("employers").select("organization_id,applicable_dot_agency").eq("id",x.employer_id).maybeSingle():{data:null,error:null};
    if(employer.error)throw employer.error;
    const ci=await db.from("testing_cases").insert({id:caseId,case_number:caseNo,customer_user_id:x.customer_user_id||uid,employer_id:employer.data?.organization_id||null,customer_name:x.company_name||donor,customer_email:ud.user.email||null,company_name:x.company_name,donor_name:donor,donor_email:donorEmail||null,donor_phone:donorPhone||null,dot_test:x.physical_type==="DOT",dot_agency:x.physical_type==="DOT"?(employer.data?.applicable_dot_agency||null):null,test_reason:x.exam_type,test_type:x.physical_type==="DOT"?"DOT physical":"Non-DOT physical",panel_name:x.physical_type+" Occupational Physical",status:"awaiting_schedule",priority:"normal",metadata:{source_domain:"occupational_health",occupational_health_order_id:x.id,source_type:x.source_type,recipient_portal:x.recipient_portal},created_by:uid,created_at:now,updated_at:now}).select("id,case_number").single();
    if(ci.error)throw ci.error;
    const up=await db.from("occupational_health_orders").update({donor_name:donor,donor_email:donorEmail||null,donor_phone:donorPhone||null,testing_case_id:ci.data.id,status:"submitted",submitted_at:now,updated_by:uid,updated_at:now}).eq("id",id).is("testing_case_id",null).eq("status","draft").select("id").maybeSingle();
    if(up.error||!up.data){await db.from("testing_cases").delete().eq("id",ci.data.id);if(up.error)throw up.error;return J({error:"This physical was already submitted."},409)}
    return J({submitted:true,testing_case:ci.data});
  }

  const profileRow=async()=>{
    const q=await db.from("user_profiles").select("*").eq("id",uid).maybeSingle();if(q.error)throw q.error;
    const p=q.data||{},m=p.metadata||{};
    return {...p,company_name:m.company_name||"",address_line_1:m.address_line_1||"",address_line_2:m.address_line_2||"",city:m.city||"",state:m.state||"",postal_code:m.postal_code||"",country:m.country||"US"};
  };
  const orderRows=async()=>{const q=await db.from("orders").select("*,order_items(*,services(*))").eq("user_id",uid).order("created_at",{ascending:false});if(q.error)throw q.error;return q.data||[]};
  const caseRows=async()=>{const q=await db.from("testing_cases").select("*").eq("customer_user_id",uid).order("created_at",{ascending:false});if(q.error)throw q.error;return q.data||[]};

  const buildWorkspace=async()=>{
    const [profile,orders,cases,passes,deliveries,proposals]=await Promise.all([
      profileRow(),orderRows(),caseRows(),
      db.from("testing_donor_passes").select("*").eq("status","issued").or(`customer_user_id.eq.${uid}${ud.user.email&&ud.user.email_confirmed_at?`,and(customer_user_id.is.null,donor_email.ilike.${ud.user.email.replace(/[%*,()]/g,"")})`:""}`).order("created_at",{ascending:false}),
      db.from("testing_document_deliveries").select("*").eq("recipient_user_id",uid).in("portal_status",["sent","viewed"]).order("created_at",{ascending:false}),
      db.from("testing_proposal_deliveries").select("*,testing_proposals(*,testing_proposal_sections(*),testing_proposal_items(*))").eq("recipient_user_id",uid).eq("portal_status","sent").order("created_at",{ascending:false})
    ]);
    if(passes.error)throw passes.error;if(deliveries.error)throw deliveries.error;if(proposals.error)throw proposals.error;
    const caseIds=cases.map((x:any)=>x.id),orderIds=orders.map((x:any)=>x.id);
    let docs:any[]=[],appointments:any[]=[],locations:any[]=[],sites:any[]=[];
    if(caseIds.length){
      const dq=await db.from("testing_case_documents").select("*").in("testing_case_id",caseIds).is("archived_at",null).order("created_at",{ascending:false});if(dq.error)throw dq.error;docs=dq.data||[];
      const aq=await db.from("scheduling_appointments").select("*").in("testing_case_id",caseIds).neq("status","cancelled").order("start_at",{ascending:false});if(aq.error)throw aq.error;appointments=aq.data||[];
    }
    if(orderIds.length){const lq=await db.from("order_donor_locations").select("*").in("order_id",orderIds).order("updated_at",{ascending:false});if(lq.error)throw lq.error;locations=lq.data||[]}
    const siteIds=[...new Set(cases.map((x:any)=>x.collection_site_id).filter(Boolean))];
    if(siteIds.length){const sq=await db.from("collection_sites").select("*").in("id",siteIds);if(sq.error)throw sq.error;sites=sq.data||[]}
    const om=new Map(orders.map((x:any)=>[x.id,x])),dm=new Map<string,any[]>(),am=new Map<string,any[]>(),lm=new Map<string,any>(),sm=new Map(sites.map((x:any)=>[x.id,x]));
    for(const d of docs){if(!dm.has(d.testing_case_id))dm.set(d.testing_case_id,[]);dm.get(d.testing_case_id)!.push(d)}
    for(const a of appointments){if(!am.has(a.testing_case_id))am.set(a.testing_case_id,[]);am.get(a.testing_case_id)!.push(a)}
    for(const l of locations){if(!lm.has(l.order_id))lm.set(l.order_id,l)}
    const testing=cases.map((c:any)=>{const order:any=om.get(c.order_id)||{},site:any=sm.get(c.collection_site_id)||null,apps=am.get(c.id)||[],requested=lm.get(c.order_id)||null;return {...c,order_number:order.order_number||null,collection_site:site?{...site,address_line_1:site.address_line1,address_line_2:site.address_line2}:null,appointments:apps,appointment:apps[0]||null,requested_location:requested,documents:dm.get(c.id)||[]}});
    const legacyDonorPasses=testing.filter((c:any)=>c.donor_pass_number).map((c:any)=>({...c,id:c.id,order_id:c.order_id,order_number:c.order_number,donor_pass_number:c.donor_pass_number,donor_name:c.donor_name||c.customer_name,requested_location:c.requested_location,ready_for_collection:!!c.collection_site_id||!!c.appointment?.location_name,needs_location:!c.collection_site_id&&!c.appointment?.location_name&&!c.requested_location,collection_site:c.collection_site,appointment:c.appointment}));
    const dedicatedPasses=(passes.data||[]).map((p:any)=>{const order:any=om.get(p.order_id)||{},requested=lm.get(p.order_id)||null,hasSite=!!(p.collection_site_name&&p.collection_site_address);return {...p,donor_pass_number:p.pass_number,order_number:order.order_number||null,requested_location:requested,collection_site:hasSite?{name:p.collection_site_name||"Assigned Collection Site",address_line_1:p.collection_site_address||null}:null,appointment:null,ready_for_collection:p.status==="issued"&&hasSite&&(!p.metadata?.labcorp_order_id||!!(p.metadata?.labcorp_registration_number||p.confirmation_code)),needs_location:!hasSite&&!requested}});
    const results=testing.filter((c:any)=>!!c.released_at).map((c:any)=>({...c,documents:(c.documents||[]).filter((d:any)=>String(d.visibility||"customer").toLowerCase()!=="internal")}));
    const flatDocs=testing.filter((c:any)=>!!c.released_at).flatMap((c:any)=>(c.documents||[]).filter((d:any)=>String(d.visibility||"customer").toLowerCase()!=="internal").map((d:any)=>({...d,case_number:c.case_number,testing_case_id:c.id})));
    const privateIds=(deliveries.data||[]).filter((d:any)=>d.source_type==="private_document").map((d:any)=>d.source_id);
    let privateDocs:any[]=[];
    if(privateIds.length){const pq=await db.from("testing_private_documents").select("*").in("id",privateIds).is("archived_at",null);if(pq.error)throw pq.error;privateDocs=pq.data||[]}
    const customerTesting=testing.map((c:any)=>c.released_at?c:{...c,overall_result:null,result_payload:null,documents:[],mro_verified_at:null});
    return {profile,orders,testing:customerTesting,donor_passes:[...dedicatedPasses,...legacyDonorPasses],results,documents:flatDocs,shared_documents:privateDocs,document_deliveries:deliveries.data||[],proposals:(proposals.data||[]).map((x:any)=>x.testing_proposals).filter(Boolean)};
  };

  if(action==="official_labcorp_pass_url"){
    const passId=clean(body.pass_id);
    if(!/^[0-9a-f-]{36}$/i.test(passId))return J({error:"Invalid donor pass"},400);
    const row=await db.from("testing_donor_passes").select("id,status,customer_user_id,order_id,metadata").eq("id",passId).eq("customer_user_id",uid).eq("status","issued").maybeSingle();
    if(row.error)throw row.error;
    const pass=row.data;
    if(!pass)return J({error:"Issued donor pass not found for this customer."},404);
    const bucket=pass.metadata?.official_labcorp_pdf_bucket,path=pass.metadata?.official_labcorp_pdf_path;
    if(bucket!=="testing-private-documents"||typeof path!=="string"||path!=="donor-passes/"+uid+"/"+pass.id+"/labcorp-registration-"+String(pass.metadata?.official_labcorp_registration||"")+".pdf")return J({error:"Original Labcorp donor pass PDF is not attached."},404);
    const signed=await db.storage.from(bucket).createSignedUrl(path,120);
    if(signed.error)throw signed.error;
    return J({ok:true,url:signed.data.signedUrl,expires_in:120,filename:"Labcorp-Donor-Pass.pdf"});
  }
  if(action==="context")return J({ok:true,allowed:true,user:{id:uid,email:ud.user.email},access:access.data});
  if(action==="workspace")return J(await buildWorkspace());
  if(action==="update_profile"){
    const current=await profileRow(),meta={...(current.metadata||{})};
    for(const k of ["company_name","address_line_1","address_line_2","city","state","postal_code","country"])if(k in body)meta[k]=clean(body[k]);
    const patch={first_name:clean(body.first_name)||null,last_name:clean(body.last_name)||null,display_name:[clean(body.first_name),clean(body.last_name)].filter(Boolean).join(" ")||current.display_name||null,phone:clean(body.phone)||null,metadata:meta,updated_at:new Date().toISOString()};
    const q=await db.from("user_profiles").update(patch).eq("id",uid).select("*").single();if(q.error)throw q.error;return J({profile:await profileRow()});
  }

  if(action==="labcorp_sites_search"||action==="labcorp_site_select"){
    const orderId=clean(body.order_id);
    if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(orderId))return J({error:"Select a valid testing order."},400);
    const own=await db.from("orders").select("id,payment_status").eq("id",orderId).eq("user_id",uid).maybeSingle();
    if(own.error)throw own.error;
    if(!own.data||own.data.payment_status!=="paid")return J({error:"A paid order in your account is required."},403);
    const configEnv=Deno.env.get("LABCORP_OTS_ENVIRONMENT")==="prod"?"prod":"cert";
    const host=configEnv==="prod"?"services.labcorpsolutions.com":"services-cert.labcorpsolutions.com";
    const endpoint=Deno.env.get("LABCORP_OTS_ENDPOINT")||"https://"+host+"/webservice/services/LabcorpOTS";
    const uri=new URL(endpoint);
    if(uri.protocol!=="https:"||uri.hostname!==host||uri.pathname!=="/webservice/services/LabcorpOTS"||uri.search||uri.hash)return J({error:"Collection site service needs configuration."},503);
    if(configEnv!=="prod")return J({error:"Live Labcorp site selection is not enabled yet. Workforce must activate the production collection-site service before a customer can choose a site."},503);
    if(configEnv==="prod"&&Deno.env.get("LABCORP_PROD_ENABLED")!=="true")return J({error:"Live collection site service is not enabled."},503);
    const username=Deno.env.get("LABCORP_OTS_USER"),password=Deno.env.get("LABCORP_OTS_PASSWORD");
    if(!username||!password)return J({error:"Collection site service credentials are missing."},503);
    const xmlEsc=(v:any)=>String(v??"").replace(/[&<>"']/g,(ch:string)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]||ch));
    const field=(xml:string,name:string)=>{
      const match=xml.match(new RegExp("<(?:[\\w.-]+:)?"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+name+">","i"));
      return match?match[1].replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim():"";
    };
    const soap=async(actionName:string,args:string)=>{
      const envelope='<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.ots.labcorp.com"><soapenv:Header/><soapenv:Body><ws:'+actionName+'><ws:userId>'+xmlEsc(username)+'</ws:userId><ws:password>'+xmlEsc(password)+'</ws:password>'+args+'</ws:'+actionName+'></soapenv:Body></soapenv:Envelope>';
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"text/xml; charset=utf-8","SOAPAction":actionName},body:envelope,signal:AbortSignal.timeout(20000)});
      const responseText=await response.text();
      if(!response.ok||/<(?:[\w.-]+:)?Fault\b/i.test(responseText)||/<(?:[\w.-]+:)?errorDescription\b/i.test(responseText)){
        console.error("Labcorp collection site lookup rejected",actionName,response.status);
        throw Object.assign(new Error("Labcorp could not verify collection sites. Please try again or contact Workforce support."),{httpStatus:502});
      }
      return responseText;
    };
    const labs=await db.from("testing_labcorp_orders").select("id,status,order_item_id,collection_site_id,collection_site_name").eq("order_id",orderId);
    if(labs.error)throw labs.error;
    const eligible=(labs.data||[]).filter((x:any)=>x.status==="draft");
    if(!eligible.length)return J({error:"No pending Labcorp registration was found for this order."},409);
    if(action==="labcorp_sites_search"){
      const zip=clean(body.zip),radius=Number(body.radius||5);
      if(!/^\d{5}$/.test(zip))return J({error:"Enter a valid five-digit ZIP code."},400);
      if(!Number.isInteger(radius)||radius<1||radius>9)return J({error:"Search radius must be between 1 and 9."},400);
      const reply=await soap("matchSites","<ws:zipCode>"+zip+"</ws:zipCode><ws:searchRadius>"+radius+"</ws:searchRadius><ws:maxMatches>15</ws:maxMatches><ws:matchSite><ws:urineDrugs>true</ws:urineDrugs></ws:matchSite>");
      const matches=[...reply.matchAll(/<(?:[\w.-]+:)?matchSitesReturn(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?matchSitesReturn>/gi)];
      const sites=matches.map(m=>{const v=m[1];return {id:field(v,"collectionSiteId"),name:field(v,"collectionSiteName"),address:[field(v,"address1"),field(v,"address2"),field(v,"city"),field(v,"state"),field(v,"zip")].filter(Boolean).join(", "),city:field(v,"city"),state:field(v,"state"),zip:field(v,"zip"),distance:Number(field(v,"distance"))||0,phone:field(v,"phoneNumber"),days:field(v,"daysofOperation"),hours:field(v,"hoursofOperation"),supports_urine:["true","1"].includes(field(v,"urineDrugs").toLowerCase())}}).filter(x=>x.id&&x.name&&x.supports_urine);
      return J({ok:true,sites,environment:configEnv,requires_selection:true,pending_tests:eligible.map((x:any)=>({order_item_id:x.order_item_id,labcorp_order_id:x.id,selected_site_id:x.collection_site_id||null,selected_site_name:x.collection_site_name||null}))});
    }
    const siteId=clean(body.site_id),itemId=clean(body.order_item_id);
    if(!/^[A-Za-z0-9_.-]{1,40}$/.test(siteId)||!/^[0-9a-f-]{36}$/i.test(itemId))return J({error:"Choose a valid test and collection site."},400);
    const lab=eligible.find((x:any)=>x.order_item_id===itemId);
    if(!lab)return J({error:"This test does not have a pending registration."},409);
    const reply=await soap("getCollectionSite","<ws:siteId>"+xmlEsc(siteId)+"</ws:siteId>");
    const match=reply.match(/<(?:[\w.-]+:)?getCollectionSiteReturn(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?getCollectionSiteReturn>/i);
    const detail=match?.[1]||"",verifiedId=field(detail,"collectionSiteId"),name=field(detail,"collectionSiteName");
    const address=[field(detail,"address1"),field(detail,"address2"),field(detail,"city"),field(detail,"state"),field(detail,"zip")].filter(Boolean).join(", ");
    if(verifiedId!==siteId||!name||!address)return J({error:"Labcorp could not verify that collection site."},422);
    const update=await db.from("testing_labcorp_orders").update({collection_site_id:siteId,collection_site_name:name,collection_site_address:address,updated_at:new Date().toISOString()}).eq("id",lab.id).eq("status","draft").select("id").maybeSingle();
    if(update.error)throw update.error;
    if(!update.data)return J({error:"Registration changed. Please refresh."},409);
    const passes=await db.from("testing_donor_passes").select("id,metadata").eq("order_id",orderId).eq("status","draft");
    if(passes.error)throw passes.error;
    for(const pass of passes.data||[]){if(pass.metadata?.labcorp_order_id===lab.id){
      const passUpdate=await db.from("testing_donor_passes").update({collection_site_name:name,collection_site_address:address,updated_at:new Date().toISOString()}).eq("id",pass.id).eq("status","draft");
      if(passUpdate.error)throw passUpdate.error;
    }}
    return J({ok:true,selected:true,site:{id:siteId,name,address},registration_status:"draft",next_step:"labcorp_registration_pending",message:"Collection site selected. Workforce will confirm the Labcorp registration before issuing your donor pass. This is not an appointment confirmation."});
  }
  if(action==="save_donor_location"){
    const orderId=clean(body.order_id);if(!orderId)return J({error:"Order is required."},400);
    const own=await db.from("orders").select("id").eq("id",orderId).eq("user_id",uid).maybeSingle();if(own.error)throw own.error;if(!own.data)return J({error:"Order not found."},404);
    const row={order_id:orderId,status:"pending",location_name:null,address_line_1:clean(body.address_line_1),address_line_2:clean(body.address_line_2)||null,city:clean(body.city),state:clean(body.state).toUpperCase(),postal_code:clean(body.postal_code),country:clean(body.country)||"US",source:"manual",updated_at:new Date().toISOString(),metadata:{requested_by_user_id:uid,requested_via:"customer_portal"}};
    if(!row.address_line_1||!row.city||!row.state||!row.postal_code)return J({error:"Street address, city, state, and ZIP code are required."},400);
    const ex=await db.from("order_donor_locations").select("id").eq("order_id",orderId).order("updated_at",{ascending:false}).limit(1).maybeSingle();if(ex.error)throw ex.error;
    const q=ex.data?await db.from("order_donor_locations").update(row).eq("id",ex.data.id).select("*").single():await db.from("order_donor_locations").insert({id:crypto.randomUUID(),...row,created_at:new Date().toISOString()}).select("*").single();if(q.error)throw q.error;return J({location:q.data});
  }
  if(action==="document_url"){
    const id=clean(body.document_id);if(!id)return J({error:"Document is required."},400);
    const cases=await caseRows(),caseIds=cases.map((x:any)=>x.id);if(!caseIds.length)return J({error:"Document not found."},404);
    const q=await db.from("testing_case_documents").select("*").eq("id",id).in("testing_case_id",caseIds).is("archived_at",null).maybeSingle();if(q.error)throw q.error;if(!q.data)return J({error:"Document not found."},404);
    if(String(q.data.visibility||"customer").toLowerCase()==="internal")return J({error:"Document not available."},403);
    const released=await db.from("testing_cases").select("released_at").eq("id",q.data.testing_case_id).maybeSingle();if(released.error)throw released.error;if(!released.data?.released_at)return J({error:"Result has not been released."},403);
    const s=await db.storage.from(q.data.storage_bucket).createSignedUrl(q.data.storage_path,300);if(s.error)throw s.error;return J({url:s.data.signedUrl,title:q.data.title||"screenings4u-document"});
  }
  if(action==="shared_document_url"){
    const id=clean(body.document_id);if(!id)return J({error:"Document is required."},400);
    const delivery=await db.from("testing_document_deliveries").select("id,portal_status").eq("source_type","private_document").eq("source_id",id).eq("recipient_user_id",uid).in("portal_status",["sent","viewed"]).maybeSingle();if(delivery.error)throw delivery.error;if(!delivery.data)return J({error:"Document not available."},403);
    const d=await db.from("testing_private_documents").select("*").eq("id",id).is("archived_at",null).maybeSingle();if(d.error)throw d.error;if(!d.data)return J({error:"Document not found."},404);
    const s=await db.storage.from(d.data.storage_bucket).createSignedUrl(d.data.storage_path,300);if(s.error)throw s.error;
    if(delivery.data.portal_status==="sent")await db.from("testing_document_deliveries").update({portal_status:"viewed",portal_viewed_at:new Date().toISOString()}).eq("id",delivery.data.id).eq("portal_status","sent");
    return J({url:s.data.signedUrl,title:d.data.title||"screenings4u-document"});
  }
  if(action==="proposal_viewed"){const id=clean(body.proposal_id);if(!id)return J({error:"Proposal is required."},400);const q=await db.from("testing_proposal_deliveries").update({portal_status:"viewed",portal_viewed_at:new Date().toISOString()}).eq("proposal_id",id).eq("recipient_user_id",uid).eq("portal_status","sent");if(q.error)throw q.error;return J({ok:true});}
  return J({error:"Unsupported customer portal action."},400);
 }catch(e){console.error("testing-customer-portal",e);return J({error:e instanceof Error?e.message:String(e)},500)}
});