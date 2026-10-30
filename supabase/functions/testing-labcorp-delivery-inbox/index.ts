import {createClient} from "npm:@supabase/supabase-js@2";
const H={"Access-Control-Allow-Origin":"https://testing-portal.screenings4u.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...H,"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:H});
 if(req.method!=="POST")return J({error:"POST required"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  const auth=createClient(url,anon,{auth:{persistSession:false}}),db=createClient(url,svc,{auth:{persistSession:false}});
  const u=await auth.auth.getUser(bearer);if(u.error||!u.data.user)return J({error:"Sign in required"},401);
  const uid=u.data.user.id;
  const [staff,access]=await Promise.all([db.from("staff_profiles").select("employment_status").eq("user_id",uid).maybeSingle(),db.from("staff_business_access").select("access_level").eq("user_id",uid).eq("business_unit_code","testing").eq("active",true).maybeSingle()]);
  if(staff.error||access.error)throw Error("Access verification failed");
  if(staff.data?.employment_status!=="active"||!access.data)return J({error:"Testing staff access required"},403);
  const b=await req.json().catch(()=>({})),action=String(b.action||"list");
  if(action==="list"){
   const events=await db.from("testing_labcorp_order_events").select("id,labcorp_order_id,event_type,created_at,labcorp_status_id,payload").eq("direction","inbound").order("created_at",{ascending:false}).limit(150);if(events.error)throw events.error;
   const orders=await db.from("testing_labcorp_orders").select("id,labcorp_order_number,account_number,status,labcorp_status_id,labcorp_status_text,accession_number,result_summary,resulted_at,last_synced_at,coc_storage_path,created_at").order("updated_at",{ascending:false}).limit(250);if(orders.error)throw orders.error;
   return J({events:(events.data||[]).map(e=>({id:e.id,labcorp_order_id:e.labcorp_order_id,event_type:e.event_type,created_at:e.created_at,labcorp_status_id:e.labcorp_status_id,classification:typeof e.payload?.classification==='string'?e.payload.classification:null})),orders:orders.data||[]});
  }
  if(action==="detail"){
   const id=String(b.id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return J({error:"Invalid order"},400);
   const [order,events]=await Promise.all([db.from("testing_labcorp_orders").select("id,testing_case_id,labcorp_order_number,account_number,account_location_code,status,labcorp_status_id,labcorp_status_text,accession_number,specimen_id,result_summary,resulted_at,last_synced_at,coc_storage_bucket,coc_storage_path").eq("id",id).maybeSingle(),db.from("testing_labcorp_order_events").select("id,event_type,created_at,labcorp_status_id,payload").eq("labcorp_order_id",id).eq("direction","inbound").order("created_at",{ascending:false}).limit(100)]);
   if(order.error||events.error)throw Error("Delivery lookup failed");if(!order.data)return J({error:"Order not found"},404);
   return J({order:order.data,events:(events.data||[]).map(e=>({...e,payload:{storage_paths:Array.isArray(e.payload?.storage_paths)?e.payload.storage_paths:[],status:e.payload?.status??null}}))});
  }
  if(action==="document"){
   const id=String(b.id||""),path=String(b.path||"");
   if(!/^[0-9a-f-]{36}$/i.test(id)||!path.startsWith("labcorp/"+id+"/")||!path.endsWith(".tiff"))return J({error:"Invalid document reference"},400);
   const order=await db.from("testing_labcorp_orders").select("id,coc_storage_path,coc_storage_bucket").eq("id",id).maybeSingle();if(order.error||!order.data)return J({error:"Order not found"},404);
   const all=await db.from("testing_labcorp_order_events").select("payload").eq("labcorp_order_id",id).eq("event_type","labcorp_coc_received");if(all.error)throw all.error;
   if(order.data.coc_storage_path!==path&&!(all.data||[]).some(e=>Array.isArray(e.payload?.storage_paths)&&e.payload.storage_paths.includes(path)))return J({error:"Document is not associated with this order"},403);
   const signed=await db.storage.from("testing-private-documents").createSignedUrl(path,60);if(signed.error)throw signed.error;
   return J({url:signed.data.signedUrl});
  }
  return J({error:"Unsupported action"},400);
 }catch(e){console.error("Labcorp delivery inbox failure",e instanceof Error?e.name:"unknown");return J({error:"Request failed"},500)}
});