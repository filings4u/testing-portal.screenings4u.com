import {createClient} from "npm:@supabase/supabase-js@2";
const NS="http://cws.ots.labcorp.com";
const reply=(operation:string,status=200)=>new Response('<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><m:'+operation+'Response xmlns:m="'+NS+'"/></soap:Body></soap:Envelope>',{status,headers:{"Content-Type":"text/xml; charset=utf-8","Cache-Control":"no-store"}});
const fault=(reason:string,status=400)=>new Response('<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Client</faultcode><faultstring>'+reason+'</faultstring></soap:Fault></soap:Body></soap:Envelope>',{status,headers:{"Content-Type":"text/xml; charset=utf-8","Cache-Control":"no-store"}});
const get=(xml:string,name:string)=>{const re=new RegExp("<(?:[\\w.-]+:)?"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+name+">","i");return (re.exec(xml)?.[1]||"").trim()};
const val=(xml:string,name:string)=>get(xml,name).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'");
const all=(xml:string,name:string)=>{const re=new RegExp("<(?:[\\w.-]+:)?"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+name+">","gi");return [...xml.matchAll(re)].map(x=>x[1].trim())};
function equals(a:string,b:string){const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let v=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)v|=(x[i]||0)^(y[i]||0);return v===0}
Deno.serve(async req=>{
 if(req.method!=="POST")return fault("POST required",405);
 if(Number(req.headers.get("content-length")||0)>12_000_000)return fault("Payload too large",413);
 const username=Deno.env.get("LABCORP_DELIVERY_USER")||"",password=Deno.env.get("LABCORP_DELIVERY_PASSWORD")||"";
 if(!username||!password)return fault("Receiver not configured",503);
 let xml="";try{xml=await req.text()}catch{return fault("Invalid request",400)}
 if(xml.length>12_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml))return fault("Invalid XML payload",400);
 const body=get(xml,"Body"),operation=["status","result","coc"].find(n=>new RegExp("<(?:[\\w.-]+:)?"+n+"(?:\\s|>)","i").test(body));
 if(!operation)return fault("Unsupported SOAP operation",400);
 const data=get(body,operation);
 if(!equals(val(data,"userId"),username)||!equals(val(data,"password"),password))return fault("Authentication failed",401);
 const account=val(operation==="result"?get(data,"result"):data,"accountNumber");
 const reg=val(operation==="result"?get(data,"result"):data,"labcorpRegistrationNumber");
 const client=val(operation==="result"?get(data,"result"):data,"clientRegistrationId");
 if(!account||(!reg&&!client))return fault("Account and registration identity required",422);
 const project=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!project||!key)return fault("Database unavailable",503);
 const db=createClient(project,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  let query=db.from("testing_labcorp_orders").select("id,account_number,account_location_code,labcorp_registration_number,client_registration_id");
  if(reg&&/^\\d+$/.test(reg))query=query.eq("labcorp_registration_number",reg);
  else query=query.eq("client_registration_id",client);
  const found=await query.eq("account_number",account).limit(2);if(found.error)throw found.error;
  if(found.data?.length!==1)return fault("Registration not uniquely matched",422);
  const order=found.data[0];
  const location=val(operation==="result"?get(data,"result"):data,"accountLocationCode");
  if(location&&order.account_location_code&&location!==order.account_location_code)return fault("Account location mismatch",422);
  const now=new Date().toISOString(),patch:Record<string,unknown>={last_synced_at:now,updated_at:now},payload:Record<string,unknown>={source:"labcorp_ots_delivery",account_number:account};
  let statusId:number|null=null;
  if(operation==="status"){
   statusId=Number(val(data,"status"));if(!Number.isInteger(statusId)||statusId<0)return fault("Invalid status",422);
   patch.labcorp_status_id=statusId;payload.status=statusId;
   const specimen=val(data,"specimenId");if(specimen)patch.specimen_id=specimen;
  }
  if(operation==="result"){
   const result=get(data,"result");const accession=val(result,"accessionNumber");
   const specimen=val(result,"specimenId");const overall=val(result,"overallSpecimenResult");
   if(!accession&&!specimen)return fault("Result identifier missing",422);
   if(accession)patch.accession_number=accession;if(specimen)patch.specimen_id=specimen;
   patch.result_summary={overall_specimen_result:overall,accession_number:accession,specimen_id:specimen,panel_id:val(result,"panelId"),transmission_type:val(result,"transmissionType"),tests:all(result,"testResults").map(test=>({test_name:val(test,"testName"),drug_id:val(test,"drugId"),qualitative:val(test,"resultQualitative"),quantitative:val(test,"resultQuantitative"),units:val(test,"units")}))};
   patch.resulted_at=now;payload.accession_number=accession;payload.overall_specimen_result=overall;
  }
  if(operation==="coc"){
   const images=all(data,"coc");if(!images.length||images.length>20)return fault("COC images required",422);
   const paths:string[]=[];
   for(let i=0;i<images.length;i++){
    const encoded=images[i].replace(/\\s+/g,"");if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)||encoded.length>10_000_000)return fault("Invalid COC data",422);
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    if(bytes.length<4||!((bytes[0]===73&&bytes[1]===73&&bytes[2]===42&&bytes[3]===0)||(bytes[0]===77&&bytes[1]===77&&bytes[2]===0&&bytes[3]===42)))return fault("COC must be TIFF",422);
    const path="labcorp/"+order.id+"/"+crypto.randomUUID()+"-"+i+".tiff";
    const uploaded=await db.storage.from("testing-private-documents").upload(path,bytes,{contentType:"image/tiff",upsert:false});if(uploaded.error)throw uploaded.error;paths.push(path);
   }
   patch.coc_storage_bucket="testing-private-documents";patch.coc_storage_path=paths[0];payload.storage_paths=paths;
  }
  const updated=await db.from("testing_labcorp_orders").update(patch).eq("id",order.id);if(updated.error)throw updated.error;
  const event=await db.from("testing_labcorp_order_events").insert({id:crypto.randomUUID(),labcorp_order_id:order.id,event_type:"labcorp_"+operation+"_received",direction:"inbound",labcorp_status_id:statusId,payload,created_at:now});if(event.error)throw event.error;

  // Notify operations only after both the order update and inbound event persist.
  // Alert emails intentionally contain no donor names, results, COC links or other PHI.
  const recipient=(Deno.env.get("LABCORP_ALERT_EMAIL")||"").trim();
  const apiKey=Deno.env.get("RESEND_API_KEY")||"";
  if(recipient&&apiKey){
   const label=operation==="status"?"Status update":operation==="result"?"Lab result received":"COC document received";
   const href="https://testing-portal.screenings4u.com/labcorp-delivery-detail.html?id="+encodeURIComponent(order.id);
   const html='<!doctype html><html><body style="margin:0;padding:30px 12px;background:#f2f6fb;font-family:Arial,sans-serif;color:#183c65"><table role="presentation" style="width:100%;max-width:600px;margin:auto;background:#fff;border:1px solid #dce6f1;border-radius:12px"><tr><td style="padding:22px 26px;border-bottom:4px solid #f36b21"><img src="https://elpbnytpciqnbexiaebp.supabase.co/storage/v1/object/public/enterprise_branding/logo-screenings4u.png" alt="screenings4u" width="190"></td></tr><tr><td style="padding:26px"><p style="color:#ec671e;font-weight:700;text-transform:uppercase;font-size:12px">Labcorp OTS notification</p><h2 style="margin:0 0 16px">'+label+'</h2><p>Labcorp sent an update for an existing Screenings4U testing order.</p><p><strong>Order:</strong> '+String(order.id)+'</p><p><a style="display:inline-block;background:#24467f;color:white;border-radius:7px;padding:13px 18px;text-decoration:none" href="'+href+'">View in Testing Management</a></p><p style="font-size:12px;color:#6a7890">Sign-in required. No medical results are included in this email.</p></td></tr></table></body></html>';
   try{
    const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({from:Deno.env.get("SCREENINGS4U_FROM_EMAIL")||"screenings4u <notifications@screenings4u.com>",to:[recipient],subject:"[screenings4u] Labcorp "+label,html})});
    if(!r.ok)console.error("Labcorp alert email delivery failed",r.status);
   }catch(e){console.error("Labcorp alert transport failure",e instanceof Error?e.name:"unknown")}
  }
  return reply(operation);
 }catch(e){console.error("Labcorp inbound delivery persistence failed",e instanceof Error?e.name:"unknown");return fault("Delivery not persisted",503)}
});
