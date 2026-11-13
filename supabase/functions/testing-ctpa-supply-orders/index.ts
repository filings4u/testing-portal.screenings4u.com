import {createClient} from "npm:@supabase/supabase-js@2";
const origin="https://testing-portal.screenings4u.com";
const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const respond=(o:unknown,status=200)=>new Response(JSON.stringify(o),{status,headers});
const uuid=(x:unknown)=>typeof x==="string"&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
const text=(x:unknown,max=160)=>String(x??"").trim().slice(0,max);
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="POST")return respond({error:"POST only"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service)return respond({error:"Testing Operations service unavailable"},503);
  const jwt=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(jwt);
  if(authError||!user)return respond({error:"Testing Operations sign-in required"},401);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const [staff,roles,access]=await Promise.all([
   db.from("staff_profiles").select("employment_status").eq("user_id",user.id).maybeSingle(),
   db.from("staff_role_assignments").select("id").eq("user_id",user.id).eq("active",true).limit(1),
   db.from("staff_business_access").select("access_level,assigned_customers_only").eq("user_id",user.id)
    .eq("business_unit_code","testing").eq("active",true).maybeSingle()
  ]);
  if(staff.error||roles.error||access.error)throw staff.error||roles.error||access.error;
  if(staff.data?.employment_status!=="active"||!roles.data?.length||!access.data||access.data.assigned_customers_only)
   return respond({error:"Staff access to C/TPA supply orders denied"},403);
  const body=await request.json().catch(()=>({})),action=text(body.action,35)||"list";
  if(action==="list"){
   const orders=await db.from("orders").select("id,order_number,customer_email,company_name,created_at,total,payment_status,status,fulfillment_status,tracking_number,metadata,order_items(quantity,unit_price,metadata)")
    .eq("metadata->>portal_source","ctpa_unified_supplies").eq("payment_status","paid")
    .order("created_at",{ascending:false}).limit(250);
   if(orders.error)throw orders.error;
   return respond({ok:true,orders:orders.data||[],
    can_update:["admin","manager","editor"].includes(text(access.data.access_level,30).toLowerCase())});
  }
  if(action!=="transition")return respond({error:"Unknown action"},400);
  if(!["admin","manager","editor"].includes(text(access.data.access_level,30).toLowerCase()))
   return respond({error:"Only authorized staff can fulfill supply orders"},403);
  if(!uuid(body.id))return respond({error:"Select a supply order"},400);
  const order=await db.from("orders").select("id,order_number,payment_status,fulfillment_status,tracking_number,metadata,updated_at")
   .eq("id",body.id).eq("metadata->>portal_source","ctpa_unified_supplies")
   .eq("payment_status","paid").maybeSingle();
  if(order.error)throw order.error;
  if(!order.data)return respond({error:"Paid supply order not found"},404);
  const previous=text(order.data.metadata?.shipment_status,30)||"new";
  const allowed:Record<string,string[]>={new:["packing"],packing:["shipped"],shipped:["delivered"],delivered:[]};
  const next=text(body.next_status,30);
  if(!(allowed[previous]||[]).includes(next))return respond({error:"Invalid fulfillment transition"},409);
  const carrier=text(body.carrier,30).toUpperCase(),tracking=text(body.tracking_number,80);
  if(next==="shipped"&&(!["UPS","FEDEX","USPS"].includes(carrier)||!/^[A-Za-z0-9]{6,80}$/.test(tracking)))
   return respond({error:"A valid UPS, FedEx or USPS tracking number is required"},400);
  const meta={...order.data.metadata,shipment_status:next,fulfillment_authorized:true,
   fulfillment_updated_by:user.id,fulfillment_updated_at:new Date().toISOString(),
   ...(next==="shipped"?{shipping_carrier:carrier}:{}),
   fulfillment_notes:text(body.notes,800)};
  const updated=await db.from("orders").update({
   fulfillment_status:next==="delivered"?"completed":"processing",
   status:next==="delivered"?"completed":"processing",
   metadata:meta,...(next==="shipped"?{tracking_number:tracking}:{}),
   ...(next==="delivered"?{fulfilled_at:new Date().toISOString()}:{}),
   updated_at:new Date().toISOString()
  }).eq("id",order.data.id).eq("payment_status","paid")
   .eq("updated_at",order.data.updated_at).select("id,fulfillment_status,tracking_number").maybeSingle();
  if(updated.error)throw updated.error;
  if(!updated.data)return respond({error:"Order changed, please refresh"},409);
  return respond({ok:true,order:updated.data,status:next});
 }catch(error){console.error("testing-ctpa-supply-orders",error);return respond({error:"Unable to process C/TPA supplies"},500)}
});