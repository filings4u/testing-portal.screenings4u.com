import { createClient } from "npm:@supabase/supabase-js@2";
const H={"Access-Control-Allow-Origin":"https://testing-portal.screenings4u.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:H});
const uuid=(x:unknown)=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(x||""));
const transitions:Record<string,string[]>={requested:["approved","cancelled"],approved:["packing","cancelled"],packing:["shipped","cancelled"],shipped:["delivered"],delivered:[],cancelled:[]};
const clean=(x:unknown,max=500)=>String(x??"").trim().slice(0,max);
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(req.method!=="POST")return reply({error:"POST required"},405);
 try {
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(jwt);
  if(authError||!user)return reply({error:"Authentication required"},401);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const [staff,roles,access]=await Promise.all([
   db.from("staff_profiles").select("employment_status").eq("user_id",user.id).maybeSingle(),
   db.from("staff_role_assignments").select("id").eq("user_id",user.id).eq("active",true).limit(1),
   db.from("staff_business_access").select("access_level").eq("user_id",user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()
  ]);
  if(staff.error||roles.error||access.error)throw staff.error||roles.error||access.error;
  if(staff.data?.employment_status!=="active"||!roles.data?.length||!access.data)return reply({error:"Workforce testing access required"},403);
  const body=await req.json().catch(()=>({}));
  const action=clean(body.action,40)||"list";
  // Only orders belonging to paid Lab Account customers are managed here.
  const memberships=await db.from("lab_account_intakes").select("customer_user_id,customer_email,account_status").not("customer_user_id","is",null).limit(5000);
  if(memberships.error)throw memberships.error;
  const allowedIds=[...new Set((memberships.data||[]).map((x:any)=>x.customer_user_id).filter(Boolean))];
  if(!allowedIds.length)return reply({orders:[],total:0});
  // Only Lab Account supply orders: new orders carry source_portal,
  // while earlier orders carry an audited Lab Account customer notification.
  const labIds=async(rows:any[])=>{
   const ids=rows.map(x=>x.id);
   if(!ids.length)return new Set<string>();
   const events=await db.from("testing_email_events").select("related_entity_id").eq("event_type","lab_account_supply_customer").eq("related_entity_type","supply_order").in("related_entity_id",ids).limit(500);
   if(events.error)throw events.error;
   return new Set<string>((events.data||[]).map((x:any)=>String(x.related_entity_id)));
  };
  if(action==="list"){
   const orders=await db.from("ic_portal_supply_orders").select("id,contractor_user_id,shipping_address,status,carrier,tracking_number,notes,created_at,updated_at,ic_portal_supply_order_lines(quantity,item_id,ic_portal_supply_items(name,sku,unit))").in("contractor_user_id",allowedIds).order("created_at",{ascending:false}).limit(250);
   if(orders.error)throw orders.error;
   const emails=new Map((memberships.data||[]).map((x:any)=>[x.customer_user_id,x.customer_email]));
   const audited=await labIds(orders.data||[]);
   const labOrders=(orders.data||[]).filter((x:any)=>x.shipping_address?.source_portal==="lab_account"||audited.has(String(x.id)));
   return reply({orders:labOrders.map((x:any)=>({...x,customer_email:emails.get(x.contractor_user_id)||null})),total:labOrders.length});
  }
  if(action==="transition"){
   if(!["admin","manager","editor"].includes(String(access.data.access_level||"").toLowerCase()))return reply({error:"Workforce testing edit permission required"},403);
   if(!uuid(body.id))return reply({error:"Invalid request identifier"},400);
   const target=clean(body.status,25),previous=clean(body.previous_status,25);
   if(!previous||!(transitions[previous]||[]).includes(target))return reply({error:"Invalid supply workflow transition"},400);
   const current=await db.from("ic_portal_supply_orders").select("id,contractor_user_id,shipping_address,status,carrier,tracking_number,notes").eq("id",body.id).maybeSingle();
   if(current.error)throw current.error;
   if(!current.data||!allowedIds.includes(current.data.contractor_user_id))return reply({error:"Supply request not found"},404);
   const audited=await labIds([current.data]);
   if(current.data.shipping_address?.source_portal!=="lab_account"&&!audited.has(String(current.data.id)))return reply({error:"Lab Account supply request not found"},404);
   if(current.data.status!==previous)return reply({error:"Request changed; reload before updating"},409);
   const carrier=clean(body.carrier,100),tracking=clean(body.tracking_number,160),notes=clean(body.notes,1000);
   if(target==="shipped"){
    const c=(carrier||clean(current.data.carrier,100)).toLowerCase().replace(/[\s.-]/g,"");
    if(!["ups","fedex","usps"].includes(c))return reply({error:"Select UPS, FedEx, or USPS as the carrier"},400);
    if(!/^[A-Za-z0-9]{6,80}$/.test(tracking||clean(current.data.tracking_number,160)))return reply({error:"Enter a valid UPS, FedEx, or USPS tracking number"},400);
   }
   const patch:any={status:target,updated_at:new Date().toISOString()};
   if(notes)patch.notes=(clean(current.data.notes,3000)+(current.data.notes?"\n":"")+new Date().toISOString()+" Workforce: "+notes).slice(0,5000);
   if(target==="shipped"){
    const c=(carrier||clean(current.data.carrier,100)).toLowerCase().replace(/[\s.-]/g,"");
    patch.carrier=c==="ups"?"UPS":c==="fedex"?"FedEx":"USPS";
    patch.tracking_number=tracking||current.data.tracking_number;
   }
   const updated=await db.from("ic_portal_supply_orders").update(patch).eq("id",body.id).eq("status",previous).select("id,status,carrier,tracking_number").maybeSingle();
   if(updated.error)throw updated.error;
   if(!updated.data)return reply({error:"Request changed; reload before updating"},409);
   const customer=(memberships.data||[]).find((x:any)=>x.customer_user_id===current.data.contractor_user_id);
   let email_status="not_required";
   if(["approved","shipped","delivered","cancelled"].includes(target)&&customer?.customer_email){
    const key=Deno.env.get("RESEND_API_KEY")||"";
    if(!key)email_status="not_configured";
    else{
     const subject="Workforce Supply Request Update";
     const msg="Your laboratory supply request is now "+target+". Sign in to your Workforce Lab Account to see the details.";
     const html='<div style="font:15px Arial,sans-serif;color:#01122f"><h2>Workforce</h2><p>'+msg+'</p><p><a href="https://lab-account.screenings4u.com/supplies.html">View your supplies</a></p></div>';
     try{
      const resp=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:Deno.env.get("SCREENINGS4U_FROM_EMAIL")||"Workforce <notifications@screenings4u.com>",to:[customer.customer_email],subject,html})});
      const j=await resp.json().catch(()=>({}));
      email_status=resp.ok?"sent":"failed";
      await db.from("testing_email_events").insert({event_type:"lab_supply_status_update",related_entity_type:"supply_order",related_entity_id:current.data.id,recipient_email:customer.customer_email,subject,provider:"resend",provider_message_id:j.id||null,status:email_status,error_message:resp.ok?null:clean(j.message||resp.status,200),sent_at:resp.ok?new Date().toISOString():null,created_by:user.id,metadata:{source:"workforce_testing",new_status:target}});
     }catch(e){email_status="failed";console.error("Supply notice failure",e)}
    }
   }
   return reply({ok:true,order:updated.data,email_status});
  }
  return reply({error:"Unsupported action"},400);
 }catch(e){console.error("testing-lab-supply-requests",e);return reply({error:"Unable to process Workforce supply request"},500)}
});
