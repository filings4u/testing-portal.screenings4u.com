import {createClient} from "npm:@supabase/supabase-js@2";
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...H,"Content-Type":"application/json","Cache-Control":"no-store"}});
const C=(v:any)=>String(v??"").trim(),N=()=>new Date().toISOString();
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
async function testingServices(db:any){
 const [s,p]=await Promise.all([db.from("services").select("*").eq("active",true).order("name"),db.from("service_prices").select("*").eq("active",true).order("effective_from",{ascending:false})]);
 if(s.error)throw s.error;if(p.error)throw p.error;const now=Date.now(),prices=new Map<string,any>();
 for(const x of p.data||[]){if(prices.has(x.service_id))continue;const from=new Date(x.effective_from).getTime(),to=x.effective_to?new Date(x.effective_to).getTime():Infinity;if(from<=now&&to>now)prices.set(x.service_id,x)}
 return (s.data||[]).filter((x:any)=>x.metadata?.public_site==="screenings4u"&&x.metadata?.public_catalog===true&&x.metadata?.testing_operation===true).map((x:any)=>({...x,current_price:prices.get(x.id)||null}));
}
function belongsToTesting(o:any){
 const m=o?.metadata||{};
 if(o?.fulfillment_type!=="testing")return false;
 if(m.seller_surface==="screenings4u_testing"&&m.finance_business_code==="testing")return true;
 if(o.source==="admin"&&/^(?:S4U-|TST-)/.test(String(o.order_number||""))&&!m.seller_surface&&!m.finance_business_code)return true;
 return false;
}
async function getOrder(db:any,id:string){
 const q=await db.from("orders").select("*").eq("id",id).eq("fulfillment_type","testing").maybeSingle();if(q.error)throw q.error;if(!q.data||!belongsToTesting(q.data))throw Object.assign(new Error("Testing order not found."),{status:404});
 const [items,cases,profile,org,labcorpOrders]=await Promise.all([
  db.from("order_items").select("*,services(*)").eq("order_id",id).order("created_at"),
  db.from("testing_cases").select("*").eq("order_id",id).order("created_at"),
  q.data.user_id?db.from("user_profiles").select("*").eq("id",q.data.user_id).maybeSingle():Promise.resolve({data:null,error:null}),
  q.data.employer_id?db.from("organizations").select("*").eq("id",q.data.employer_id).maybeSingle():Promise.resolve({data:null,error:null}),
  db.from("testing_labcorp_orders").select("*").eq("order_id",id).order("created_at",{ascending:false})
 ]);
 for(const x of [items,cases,profile,org,labcorpOrders])if(x.error)throw x.error;
 return {order:q.data,items:items.data||[],cases:cases.data||[],profile:profile.data||null,organization:org.data||null,labcorp_orders:labcorpOrders.data||[]};
}
async function totalize(db:any,orderId:string){
 const q=await db.from("order_items").select("line_total").eq("order_id",orderId);if(q.error)throw q.error;
 const subtotal=(q.data||[]).reduce((n:number,x:any)=>n+Number(x.line_total||0),0);
 const o=await db.from("orders").select("discount_amount,tax").eq("id",orderId).single();if(o.error)throw o.error;
 const total=Math.max(0,subtotal-Number(o.data.discount_amount||0)+Number(o.data.tax||0));
 const u=await db.from("orders").update({subtotal,total,updated_at:N()}).eq("id",orderId).select("*").single();if(u.error)throw u.error;return u.data;
}

const receiptTemplate="<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>@media screen and (max-width:480px){.mail-shell{width:100%!important;max-width:100%!important}.mail-outer{padding:12px 8px!important}.mail-logo{width:168px!important}.mail-summary td{font-size:12px!important}.mail-items td{padding:8px 4px!important;font-size:12px!important;line-height:1.4!important;word-break:normal!important}.mail-items th{font-size:12px!important}.mail-cta{display:block!important;text-align:center!important;padding:14px 10px!important}.mail-h1{font-size:25px!important}}</style><title>Thank you for your order! | screenings4u</title></head><body style=\"margin:0;background:#f2f6fc;font-family:Arial,Helvetica,sans-serif;color:#163568;-webkit-text-size-adjust:100%;text-size-adjust:100%;\"><div style=\"display:none;max-height:0;overflow:hidden;opacity:0\">Hi {{CUSTOMER_FIRST_NAME}}, your payment is confirmed. Below is your order summary and receipt. Please check your inbox and spam folder for your customer portal invitation when applicable.</div><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"background:#f2f6fc\"><tr><td align=\"center\" class=\"mail-outer\" style=\"padding:16px 10px\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" class=\"mail-shell\" style=\"max-width:640px;width:100%;background:#ffffff;border:1px solid #d8e5f3;border-radius:16px\"><tr><td style=\"padding:22px 20px 18px;border-bottom:1px solid #e5edf6\"><img src=\"https://elpbnytpciqnbexiaebp.supabase.co/storage/v1/object/public/enterprise_branding/logo-screenings4u.png\" class=\"mail-logo\" width=\"180\" alt=\"screenings4u\" style=\"display:block;max-width:100%;height:auto;border:0\"></td></tr><tr><td style=\"padding:24px 20px 8px;text-align:center\"><div style=\"display:inline-block;background:#eaf3ff;color:#244e89;border-radius:100%;padding:14px 20px;font-size:30px\">✓</div><p style=\"font-size:12px;font-weight:bold;letter-spacing:2px;color:#ff6b00\">PAYMENT CONFIRMED</p><h1 class=\"mail-h1\" style=\"font-size:26px;line-height:1.2;color:#163568;margin:10px 0 16px\">Thank you for your order!</h1><p style=\"font-size:14px;line-height:1.55;color:#587391\">Hi {{CUSTOMER_FIRST_NAME}}, your payment is confirmed. Below is your order summary and receipt. Please check your inbox and spam folder for your customer portal invitation when applicable.</p></td></tr><tr><td style=\"padding:10px 15px 24px\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"border:1px solid #d8e5f3;border-radius:12px;background:#fff;margin:12px 0 22px\"><tr><td style=\"padding:16px\"><h2 style=\"margin:0 0 15px;color:#163568;font-size:19px\">Order Summary</h2><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" class=\"mail-summary\" style=\"font-size:13px;color:#59708d\"><tr><td style=\"padding:6px 0\">Order number</td><td align=\"right\" style=\"font-weight:bold;color:#163568\">{{ORDER_NUMBER}}</td></tr><tr><td style=\"padding:6px 0\">Tracking number</td><td align=\"right\" style=\"font-weight:bold;color:#163568\">{{TRACKING_NUMBER}}</td></tr><tr><td style=\"padding:6px 0 14px\">Order date</td><td align=\"right\" style=\"font-weight:bold;color:#163568\">{{ORDER_DATE}}</td></tr></table><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" class=\"mail-items\" style=\"border-collapse:collapse;font-size:13px;table-layout:fixed\"><tr><th align=\"left\" style=\"padding:7px 5px;background:#eef4fc\">Item</th><th align=\"center\" style=\"padding:7px 5px;background:#eef4fc\">Qty</th><th align=\"right\" style=\"padding:7px 5px;background:#eef4fc\">Amount</th></tr>{{ORDER_ITEMS_HTML}}</table><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"font-size:13px;color:#59708d\"><tr><td style=\"padding:12px 0 4px\">Subtotal</td><td align=\"right\">{{SUBTOTAL}}</td></tr><tr><td style=\"padding:4px 0\">Discount</td><td align=\"right\">{{DISCOUNT}}</td></tr><tr><td style=\"padding:4px 0 12px\">Tax</td><td align=\"right\">{{TAX}}</td></tr><tr><td style=\"padding:14px 0;border-top:1px solid #d8e5f3;font-size:17px;font-weight:bold;color:#163568\">Total paid</td><td align=\"right\" style=\"border-top:1px solid #d8e5f3;font-size:17px;font-weight:bold;color:#163568\">{{TOTAL}}</td></tr></table></td></tr></table><p style=\"text-align:center;margin:24px 0\"><a href=\"{{RECEIPT_URL}}\" class=\"mail-cta\" style=\"display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;font-weight:bold;border-radius:9px;padding:16px 26px\">View Order & Download Receipt &rarr;</a></p></td></tr><tr><td style=\"padding:22px 30px;background:#f7faff;border-top:1px solid #dbe5f2;text-align:center\"><p style=\"margin:0 0 8px;font-size:13px;color:#284b7d;font-weight:bold\">Need help? <a style=\"color:#ff6b00\" href=\"mailto:support@screenings4u.com\">support@screenings4u.com</a></p><p style=\"margin:0;font-size:11px;color:#7183a0\">screenings4u · Secure drug and alcohol testing services</p></td></tr></table></td></tr></table></body></html>";
function receiptHtml(o:any,items:any[]){
 const esc=(v:any)=>String(v??"").replace(/[&<>"']/g,(c:string)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
 const cash=(n:any)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n||0));
 const rows=items.map((i:any)=>'<tr><td style="padding:12px;border-bottom:1px solid #e5eaf2">'+esc(i.metadata?.service_name||i.services?.name||"Service")+'</td><td style="padding:12px;border-bottom:1px solid #e5eaf2;text-align:center">'+Number(i.quantity||1)+'</td><td style="padding:12px;border-bottom:1px solid #e5eaf2;text-align:right">'+cash(Number(i.line_total??Number(i.unit_price||0)*Number(i.quantity||1)))+'</td></tr>').join("");
 const url="https://customers.screenings4u.com/order-details.html?order="+encodeURIComponent(o.id);
 const vars:any={CUSTOMER_FIRST_NAME:o.customer_first_name||"Customer",ORDER_NUMBER:o.order_number,TRACKING_NUMBER:o.tracking_number||"—",ORDER_DATE:new Date(o.created_at).toLocaleDateString("en-US"),ORDER_ITEMS_HTML:rows,SUBTOTAL:cash(o.subtotal),DISCOUNT:cash(o.discount_amount),TAX:cash(o.tax),TOTAL:cash(o.total),RECEIPT_URL:url};
 return receiptTemplate.replace(/{{([A-Z_]+)}}/g,(_:string,k:string)=>k==="ORDER_ITEMS_HTML"?vars[k]||"":esc(vars[k]||""));
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:H});
 if(req.method!=="POST")return J({error:"Method not allowed."},405);
 try{
  const {db,user}=await ctx(req),b=await req.json().catch(()=>({})),a=C(b.action||"list");
  if(a==="receipt"){
    const id=C(b.order_id);if(!id)return J({error:"Order ID is required."},400);
    const detail=await getOrder(db,id);if(detail.order.payment_status!=="paid")return J({error:"A paid receipt is not available for an unpaid order."},409);
    return J({html:receiptHtml(detail.order,detail.items||[])});
  }
  if(a==="push_to_customer"||a==="send_order_email"){
    const id=C(b.order_id);if(!id)return J({error:"Order ID is required."},400);
    const detail=await getOrder(db,id),o=detail.order,email=C(o.customer_email).toLowerCase();
    if(!o.user_id||!email)return J({error:"Link this order to the existing customer account before delivery."},409);
    const auth=await db.auth.admin.getUserById(o.user_id);
    if(auth.error||!auth.data.user||C(auth.data.user.email).toLowerCase()!==email)return J({error:"Order account does not match customer email. Review account linkage."},409);
    if(a==="push_to_customer"){
      const existing=await db.from("testing_customer_portal_access").select("user_id,status").eq("user_id",o.user_id).maybeSingle();
      if(existing.error)throw existing.error;
      if(!existing.data||!["active","enabled"].includes(C(existing.data.status).toLowerCase())){
        if(o.payment_status!=="paid")return J({error:"Only paid testing orders can activate customer testing access."},409);
        const up=await db.from("testing_customer_portal_access").upsert({user_id:o.user_id,status:"active",access_source:"purchase",updated_at:N()},{onConflict:"user_id"});
        if(up.error)throw up.error;
      }
      return J({ok:true,already_linked:!!existing.data,order_id:id,customer_user_id:o.user_id});
    }
    if(o.payment_status!=="paid")return J({error:"An order must be paid before its customer email can be sent."},409);
    const key=Deno.env.get("RESEND_API_KEY")||"";
    if(!key)return J({error:"Transactional email service is not configured."},503);
    const subject="Your screenings4u purchase receipt — "+C(o.order_number);
    const send=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:Deno.env.get("SCREENINGS4U_FROM_EMAIL")||"screenings4u <notifications@screenings4u.com>",to:[email],subject,html:receiptHtml(o,detail.items||[])})});
    const result=await send.json().catch(()=>({}));
    if(!send.ok)return J({error:C(result.message)||"Email provider declined delivery."},502);
    return J({ok:true,sent:true,order_id:id,message_id:result.id||null});
  }
  if(a==="website_orders"){
   const q=await db.from("orders").select("*").eq("source","website").order("created_at",{ascending:false}).limit(5000);if(q.error)throw q.error;
   const testing=await db.from("orders").select("*").eq("fulfillment_type","testing").eq("source","admin").order("created_at",{ascending:false}).limit(5000);if(testing.error)throw testing.error;
   return J({orders:[...(q.data||[]),...(testing.data||[])]});
  }
  if(a==="website_order_get"){
   const id=C(b.order_id);if(!id)return J({error:"Order ID is required."},400);
   const q=await db.from("orders").select("*").eq("id",id).eq("source","website").maybeSingle();if(q.error)throw q.error;
   if(!q.data)return J({error:"Website order not found."},404);
   const items=await db.from("order_items").select("*,services(name)").eq("order_id",id);if(items.error)throw items.error;
   return J({order:q.data,items:items.data||[],cases:[]});
  }
  if(a==="list"){
   const q=await db.from("orders").select("*").eq("fulfillment_type","testing").order("created_at",{ascending:false}).limit(5000);if(q.error)throw q.error;
   return J({orders:(q.data||[]).filter(belongsToTesting)});
  }
  if(a==="options"){
   const [services,profiles,orgs]=await Promise.all([
    testingServices(db),
    db.from("user_profiles").select("id,display_name,first_name,last_name,email,phone,status").eq("status","active").order("display_name"),
    db.from("organizations").select("id,legal_name,dba_name,primary_email,status").eq("status","active").order("legal_name")
   ]);if(profiles.error)throw profiles.error;if(orgs.error)throw orgs.error;
   return J({services,profiles:profiles.data||[],organizations:orgs.data||[]});
  }
  if(a==="get"){const id=C(b.order_id||b.id);if(!id)return J({error:"Order id is required."},400);return J(await getOrder(db,id));}
  if(a==="create"){
   const email=C(b.customer_email).toLowerCase(),first=C(b.customer_first_name),last=C(b.customer_last_name),uid=C(b.user_id)||null,orgId=C(b.employer_id)||null;
   if(!email)return J({error:"Customer email is required."},400);
   if(uid){const account=await db.auth.admin.getUserById(uid);if(account.error||!account.data.user||C(account.data.user.email).toLowerCase()!==email)return J({error:"Selected customer account must match the order email."},409);}
   const fin=await db.from("finance_business_units").select("id,legal_entity_id").eq("code","testing").maybeSingle();if(fin.error)throw fin.error;
   const id=crypto.randomUUID(),orderNumber="TST-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+id.slice(0,8).toUpperCase();
   const q=await db.from("orders").insert({
    id,order_number:orderNumber,user_id:uid,customer_email:email,customer_first_name:first||null,customer_last_name:last||null,customer_phone:C(b.customer_phone)||null,
    status:"pending",payment_status:C(b.payment_status)==="paid"?"paid":"unpaid",subtotal:0,tax:Number(b.tax||0),total:0,payment_provider:C(b.payment_provider)||null,payment_reference:C(b.payment_reference)||null,
    notes:C(b.notes)||null,metadata:{finance_business_code:"testing",seller_surface:"screenings4u_testing",created_from:"testing_management"},source:"admin",fulfillment_type:"testing",fulfillment_status:"pending",
    payment_method:C(b.payment_method)||null,currency:"usd",billing_address_line_1:C(b.billing_address_line_1)||null,billing_address_line_2:C(b.billing_address_line_2)||null,billing_city:C(b.billing_city)||null,billing_state:C(b.billing_state)||null,billing_postal_code:C(b.billing_postal_code)||null,billing_country:C(b.billing_country)||"US",
    internal_notes:C(b.internal_notes)||null,customer_notes:C(b.customer_notes)||null,payment_override_reason:C(b.payment_override_reason)||null,created_by_admin_id:user.id,
    paid_at:C(b.payment_status)==="paid"?N():null,employer_id:orgId,company_name:C(b.company_name)||null,discount_amount:Number(b.discount_amount||0),legal_entity_id:fin.data?.legal_entity_id||null,finance_business_unit_id:fin.data?.id||null,created_at:N(),updated_at:N()
   }).select("*").single();if(q.error)throw q.error;
   const items=Array.isArray(b.items)?b.items:[];
   for(const x of items){
    const sid=C(x.service_id);if(!sid)continue;const svc=(await testingServices(db)).find((s:any)=>s.id===sid);if(!svc)continue;
    const qty=Math.max(1,Number(x.quantity||1)),unit=x.unit_price!==undefined?Number(x.unit_price):Number(svc.current_price?.amount||0),line=qty*unit;
    const iq=await db.from("order_items").insert({id:crypto.randomUUID(),order_id:id,service_id:sid,quantity:qty,unit_price:unit,line_total:line,metadata:{source:"testing_management"},created_at:N()});if(iq.error)throw iq.error;
   }
   await totalize(db,id);return J(await getOrder(db,id));
  }
  if(a==="update"){
   const id=C(b.order_id);if(!id)return J({error:"Order id is required."},400);await getOrder(db,id);
   const patch:any={updated_at:N()};
   for(const f of ["user_id","employer_id"])if(Object.prototype.hasOwnProperty.call(b,f))patch[f]=C(b[f])||null;
   for(const f of ["customer_email","customer_first_name","customer_last_name","customer_phone","company_name","notes","internal_notes","customer_notes","billing_address_line_1","billing_address_line_2","billing_city","billing_state","billing_postal_code","billing_country"])if(Object.prototype.hasOwnProperty.call(b,f))patch[f]=C(b[f])||null;
   if(Object.prototype.hasOwnProperty.call(b,"tax"))patch.tax=Number(b.tax||0);
   if(Object.prototype.hasOwnProperty.call(b,"discount_amount"))patch.discount_amount=Number(b.discount_amount||0);
   if(Object.prototype.hasOwnProperty.call(patch,"user_id")||Object.prototype.hasOwnProperty.call(patch,"customer_email")){const original=await db.from("orders").select("user_id,customer_email").eq("id",id).single();if(original.error)throw original.error;const linked=Object.prototype.hasOwnProperty.call(patch,"user_id")?patch.user_id:original.data.user_id;const email=C(Object.prototype.hasOwnProperty.call(patch,"customer_email")?patch.customer_email:original.data.customer_email).toLowerCase();const identityChanged=linked!==original.data.user_id||email!==C(original.data.customer_email).toLowerCase();if(!identityChanged){delete patch.user_id;delete patch.customer_email;}else if(linked){const account=await db.auth.admin.getUserById(linked);if(account.error||!account.data.user)return J({error:"Selected customer portal account was not found. Choose an existing account or leave the account unchanged."},409);if(C(account.data.user.email).toLowerCase()!==email)return J({error:"The customer login email differs from this order email. Change the login email through the customer account management process before relinking the order, or select an account whose email matches."},409);}}
   const q=await db.from("orders").update(patch).eq("id",id).select("*").single();if(q.error)throw q.error;await totalize(db,id);return J(await getOrder(db,id));
  }
  if(a==="add_item"){
   const id=C(b.order_id),sid=C(b.service_id);if(!id||!sid)return J({error:"Order and service are required."},400);await getOrder(db,id);
   const svc=(await testingServices(db)).find((s:any)=>s.id===sid);if(!svc)return J({error:"Testing service not found."},404);
   const qty=Math.max(1,Number(b.quantity||1)),unit=b.unit_price!==undefined&&b.unit_price!==""?Number(b.unit_price):Number(svc.current_price?.amount||0),line=qty*unit;
   const q=await db.from("order_items").insert({id:crypto.randomUUID(),order_id:id,service_id:sid,quantity:qty,unit_price:unit,line_total:line,metadata:{source:"testing_management"},created_at:N()}).select("*,services(*)").single();if(q.error)throw q.error;await totalize(db,id);return J({item:q.data});
  }
  if(a==="update_item"){
   const iid=C(b.item_id);if(!iid)return J({error:"Order item is required."},400);
   const ex=await db.from("order_items").select("*").eq("id",iid).maybeSingle();if(ex.error)throw ex.error;if(!ex.data)return J({error:"Order item not found."},404);
   await getOrder(db,ex.data.order_id);const qty=Math.max(1,Number(b.quantity||ex.data.quantity||1)),unit=b.unit_price!==undefined?Number(b.unit_price):Number(ex.data.unit_price||0);
   const q=await db.from("order_items").update({quantity:qty,unit_price:unit,line_total:qty*unit,metadata:{...(ex.data.metadata||{}),updated_from:"testing_management"}}).eq("id",iid).select("*,services(*)").single();if(q.error)throw q.error;await totalize(db,ex.data.order_id);return J({item:q.data});
  }
  if(a==="remove_item"){
   const iid=C(b.item_id);if(!iid)return J({error:"Order item is required."},400);
   const ex=await db.from("order_items").select("*").eq("id",iid).maybeSingle();if(ex.error)throw ex.error;if(!ex.data)return J({error:"Order item not found."},404);
   await getOrder(db,ex.data.order_id);const linked=await db.from("testing_cases").select("id").eq("order_item_id",iid).limit(1);if(linked.error)throw linked.error;if((linked.data||[]).length)return J({error:"This item already has a Testing case and cannot be removed."},409);
   const q=await db.from("order_items").delete().eq("id",iid);if(q.error)throw q.error;await totalize(db,ex.data.order_id);return J({ok:true});
  }
  if(a==="record_payment"){
   const id=C(b.order_id),status=C(b.payment_status);if(!id||!["unpaid","pending","paid","failed","refunded","partially_refunded"].includes(status))return J({error:"Order and valid payment status are required."},400);const existing=(await getOrder(db,id)).order;
   if(existing.payment_provider==="stripe"||existing.stripe_payment_intent_id||String(existing.payment_reference||"").startsWith("pi_"))return J({error:"Stripe-linked payments are read-only here. Payment status must come from Stripe webhooks; refunds require the authorized refund workflow."},403);
   const patch:any={payment_status:status,payment_provider:C(b.payment_provider)||null,payment_reference:C(b.payment_reference)||null,payment_override_reason:C(b.payment_override_reason)||null,updated_at:N()};
   if(status==="paid"){patch.paid_at=N();patch.status="processing"}if(status==="refunded")patch.refunded_at=N();
   const q=await db.from("orders").update(patch).eq("id",id).select("*").single();if(q.error)throw q.error;return J({order:q.data});
  }
  if(a==="history"){
   const id=C(b.order_id);const o=(await getOrder(db,id)).order;
   const logs=await db.from("management_audit_events").select("id,actor_user_id,action,metadata,created_at").eq("portal_code","testing").eq("entity_type","order").eq("entity_id",id).order("created_at",{ascending:false}).limit(100);
   if(logs.error)throw logs.error;
   const ids=[...new Set((logs.data||[]).map((x:any)=>x.actor_user_id).filter(Boolean))];
   const people=ids.length?await db.from("user_profiles").select("id,display_name,first_name,last_name").in("id",ids):{data:[],error:null};if(people.error)throw people.error;
   const names=new Map((people.data||[]).map((x:any)=>[x.id,x.display_name||[x.first_name,x.last_name].filter(Boolean).join(" ")||"Staff member"]));
   const enriched=(logs.data||[]).map((x:any)=>({...x,actor_name:names.get(x.actor_user_id)||"Staff member"}));
   return J({history:enriched,milestones:[{event:"created",at:o.created_at},{event:"paid",at:o.paid_at},{event:"fulfilled",at:o.fulfilled_at},{event:"cancelled",at:o.cancelled_at},{event:"refunded",at:o.refunded_at}].filter((x:any)=>x.at)});
  }
  if(a==="add_internal_note"){
   const id=C(b.order_id),note=C(b.note);
   if(!id||!note||note.length>3000)return J({error:"Enter a note between 1 and 3000 characters."},400);
   await getOrder(db,id);
   const saved=await db.from("management_audit_events").insert({actor_user_id:user.id,portal_code:"testing",action:"internal_note_added",entity_type:"order",entity_id:id,metadata:{note}}).select("id,actor_user_id,action,metadata,created_at").single();
   if(saved.error)throw saved.error;
   return J({note:saved.data});
  }
  if(a==="update_fulfillment"){
   const id=C(b.order_id),status=C(b.fulfillment_status),reason=C(b.reason);
   if(!["pending","processing","completed"].includes(status))return J({error:"Invalid fulfillment state."},400);
   const existing=(await getOrder(db,id)).order;
   if(existing.status==="cancelled"||existing.status==="refunded"||existing.fulfillment_status==="cancelled")return J({error:"Cancelled or refunded orders cannot be fulfilled."},409);
   if(existing.payment_status!=="paid"&&status!=="pending")return J({error:"Payment must be recorded as paid before fulfillment begins."},409);
   if(existing.fulfillment_status==="completed"&&status!=="completed")return J({error:"Completed fulfillment cannot be reopened here."},409);
   if(existing.fulfillment_status===status)return J({order:existing,unchanged:true});
   if(!reason)return J({error:"Reason is required for fulfillment changes."},400);
   const patch:any={fulfillment_status:status,updated_at:N()};if(status==="completed")patch.fulfilled_at=N();
   const saved=await db.from("orders").update(patch).eq("id",id).eq("fulfillment_status",existing.fulfillment_status).select("*").maybeSingle();if(saved.error)throw saved.error;if(!saved.data)return J({error:"Order changed during update. Refresh and retry."},409);
   const audit=await db.from("management_audit_events").insert({actor_user_id:user.id,portal_code:"testing",action:"fulfillment_changed",entity_type:"order",entity_id:id,metadata:{from:existing.fulfillment_status,to:status,reason}});
   if(audit.error)console.error("Fulfillment audit write failed",audit.error);
   return J({order:saved.data,audit_recorded:!audit.error});
  }
  if(a==="cancel"){
   const id=C(b.order_id),reason=C(b.reason);
   if(!id||!reason)return J({error:"Cancellation reason is required."},400);
   const existing=(await getOrder(db,id)).order;
   if(existing.status==="cancelled")return J({error:"Order is already cancelled."},409);
   if(existing.status==="refunded"||existing.fulfillment_status==="completed")return J({error:"Refunded or completed orders cannot be cancelled here."},409);
   if(existing.stripe_payment_intent_id||existing.stripe_checkout_session_id||existing.payment_provider==="stripe"||String(existing.payment_reference||"").startsWith("pi_"))return J({error:"Stripe-linked orders cannot be cancelled from this screen. Use the authorized cancellation/refund workflow to keep payment and order records consistent."},409);
   const q=await db.from("orders").update({status:"cancelled",fulfillment_status:"cancelled",cancelled_at:N(),updated_at:N()}).eq("id",id).eq("status",existing.status).select("*").maybeSingle();if(q.error)throw q.error;if(!q.data)return J({error:"Order changed during cancellation. Refresh and retry."},409);
   const audit=await db.from("management_audit_events").insert({actor_user_id:user.id,portal_code:"testing",action:"order_cancelled",entity_type:"order",entity_id:id,metadata:{reason,from:existing.status,to:"cancelled"}});
   if(audit.error)console.error("Cancellation audit write failed",audit.error);
   return J({order:q.data,audit_recorded:!audit.error});
  }
  return J({error:"Unsupported Testing order action."},400);
 }catch(e:any){console.error("testing-order-management",e);return J({error:e instanceof Error?e.message:String(e)},Number(e?.status||500))}
});