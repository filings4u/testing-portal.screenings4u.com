import {createClient} from "npm:@supabase/supabase-js@2";
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...H,"Content-Type":"application/json","Cache-Control":"no-store"}});
const C=(v:any)=>String(v??"").trim(),N=()=>new Date().toISOString();

async function ctx(req:Request){
 const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token)throw Object.assign(new Error("Authentication required."),{status:401});
 const ac=createClient(url,anon,{auth:{persistSession:false}}),db=createClient(url,svc,{auth:{persistSession:false}});
 const u=await ac.auth.getUser(token);if(u.error||!u.data.user)throw Object.assign(new Error("Authentication required."),{status:401});
 const [sp,ba]=await Promise.all([
  db.from("staff_profiles").select("employment_status").eq("user_id",u.data.user.id).maybeSingle(),
  db.from("staff_business_access").select("access_level").eq("user_id",u.data.user.id).eq("business_unit_code","testing").eq("active",true).maybeSingle()
 ]);
 if(sp.error)throw sp.error;if(ba.error)throw ba.error;
 if(!sp.data||sp.data.employment_status!=="active"||!ba.data)throw Object.assign(new Error("Testing Management access required."),{status:403});
 return{db,user:u.data.user};
}
async function log(db:any,userId:string,actor:string,type:string,notes:string|null,metadata:any={}){
 const q=await db.from("testing_customer_events").insert({id:crypto.randomUUID(),user_id:userId,event_type:type,notes:notes||null,actor_user_id:actor,metadata,created_at:N()});if(q.error)throw q.error;
}
async function customer(db:any,userId:string){
 const [profile,access,orders,cases,members,events]=await Promise.all([
  db.from("user_profiles").select("*").eq("id",userId).maybeSingle(),
  db.from("testing_customer_portal_access").select("*").eq("user_id",userId).maybeSingle(),
  db.from("orders").select("*").eq("user_id",userId).eq("fulfillment_type","testing").order("created_at",{ascending:false}),
  db.from("testing_cases").select("*").eq("customer_user_id",userId).order("created_at",{ascending:false}),
  db.from("testing_employer_members").select("*").eq("user_id",userId).order("created_at"),
  db.from("testing_customer_events").select("*").eq("user_id",userId).order("created_at",{ascending:false})
 ]);
 for(const q of [profile,access,orders,cases,members,events])if(q.error)throw q.error;
 const employerIds=[...new Set((members.data||[]).map((x:any)=>x.employer_id).filter(Boolean))];
 const employers=employerIds.length?await db.from("testing_employers").select("*").in("id",employerIds):{data:[],error:null};if(employers.error)throw employers.error;
 const orgIds=[...new Set((employers.data||[]).map((x:any)=>x.organization_id).filter(Boolean))];
 const orgs=orgIds.length?await db.from("organizations").select("*").in("id",orgIds):{data:[],error:null};if(orgs.error)throw orgs.error;
 return{profile:profile.data||null,portal_access:access.data||null,orders:orders.data||[],cases:cases.data||[],memberships:members.data||[],employers:employers.data||[],organizations:orgs.data||[],events:events.data||[]};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:H});
 if(req.method!=="POST")return J({error:"Method not allowed."},405);
 try{
  const{db,user}=await ctx(req),b=await req.json().catch(()=>({})),a=C(b.action||"list");
  if(a==="list"){
   const [access,orders,cases,members]=await Promise.all([
    db.from("testing_customer_portal_access").select("*").order("updated_at",{ascending:false}),
    db.from("orders").select("user_id").eq("fulfillment_type","testing").not("user_id","is",null),
    db.from("testing_cases").select("customer_user_id").not("customer_user_id","is",null),
    db.from("testing_employer_members").select("user_id")
   ]);for(const q of [access,orders,cases,members])if(q.error)throw q.error;
   const ids=[...new Set([...(access.data||[]).map((x:any)=>x.user_id),...(orders.data||[]).map((x:any)=>x.user_id),...(cases.data||[]).map((x:any)=>x.customer_user_id),...(members.data||[]).map((x:any)=>x.user_id)].filter(Boolean))];
   if(!ids.length)return J({customers:[]});
   const p=await db.from("user_profiles").select("*").in("id",ids).order("display_name");if(p.error)throw p.error;
   const am=new Map((access.data||[]).map((x:any)=>[x.user_id,x]));
   return J({customers:(p.data||[]).map((x:any)=>({...x,portal_access:am.get(x.id)||null}))});
  }
  if(a==="get"){const id=C(b.user_id||b.id);if(!id)return J({error:"Customer id is required."},400);return J(await customer(db,id));}
  if(a==="options"){
   const [profiles,employers]=await Promise.all([
    db.from("user_profiles").select("id,display_name,first_name,last_name,email,phone,status").eq("status","active").order("display_name"),
    db.from("testing_employers").select("*").eq("status","active").order("employer_name")
   ]);if(profiles.error)throw profiles.error;if(employers.error)throw employers.error;return J({profiles:profiles.data||[],employers:employers.data||[]});
  }
  if(a==="update_profile"){
   const id=C(b.user_id);if(!id)return J({error:"Customer id is required."},400);
   const current=await db.from("user_profiles").select("*").eq("id",id).maybeSingle();if(current.error)throw current.error;if(!current.data)return J({error:"Customer profile not found."},404);
   const patch:any={updated_at:N()};
   for(const f of ["first_name","last_name","display_name","phone"])if(Object.prototype.hasOwnProperty.call(b,f))patch[f]=C(b[f])||null;
   const requestedEmail=C(b.email).toLowerCase(),currentEmail=C(current.data.email).toLowerCase();
   if(Object.prototype.hasOwnProperty.call(b,"email")&&requestedEmail!==currentEmail){
    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(requestedEmail))return J({error:"Enter a valid customer email."},400);
    const admin=await db.from("staff_business_access").select("id").eq("user_id",user.id).eq("business_unit_code","testing").eq("access_level","admin").eq("active",true).limit(1);
    if(admin.error)throw admin.error;if(!admin.data?.length)return J({error:"Administrator access is required to change the customer login email."},403);
    const existingAuth=await db.auth.admin.getUserById(id);if(existingAuth.error||!existingAuth.data.user)return J({error:"Customer authentication account not found."},409);
    const priorAuth=C(existingAuth.data.user.email).toLowerCase();
    const duplicate=await db.from("user_profiles").select("id").ilike("email",requestedEmail).neq("id",id).limit(1);if(duplicate.error)throw duplicate.error;
    if(duplicate.data?.length)return J({error:"Email already belongs to another customer."},409);
    const orders=await db.from("orders").select("id,customer_email").eq("user_id",id).eq("fulfillment_type","testing");if(orders.error)throw orders.error;
    const ids=(orders.data||[]).filter((o:any)=>[priorAuth,currentEmail].includes(C(o.customer_email).toLowerCase())).map((o:any)=>o.id);
    const authChange=await db.auth.admin.updateUserById(id,{email:requestedEmail,email_confirm:true});
    if(authChange.error)return J({error:"Customer login email update failed: "+authChange.error.message},409);
    try{
     patch.email=requestedEmail;
     const updated=await db.from("user_profiles").update(patch).eq("id",id).select("*").single();if(updated.error)throw updated.error;
     if(ids.length){const uq=await db.from("orders").update({customer_email:requestedEmail,updated_at:N()}).in("id",ids);if(uq.error)throw uq.error}
     await log(db,id,user.id,"customer_profile_updated",C(b.notes)||null,{email_changed:true,orders_updated:ids.length});
     return J({profile:updated.data,orders_updated:ids.length});
    }catch(err){
     console.error("customer email synchronization failed",err);
     const rollback=await db.auth.admin.updateUserById(id,{email:priorAuth,email_confirm:true});
     await db.from("user_profiles").update({email:current.data.email,updated_at:N()}).eq("id",id);
     if(ids.length)await db.from("orders").update({customer_email:currentEmail,updated_at:N()}).in("id",ids);
     return J({error:rollback.error?"Customer email update partially failed; contact administrator to reconcile account.":"Unable to synchronize customer email; previous login restored."},500);
    }
   }
   const q=await db.from("user_profiles").update(patch).eq("id",id).select("*").single();if(q.error)throw q.error;
   await log(db,id,user.id,"customer_profile_updated",C(b.notes)||null);return J({profile:q.data});
  }
  if(a==="set_portal_access"){
   const id=C(b.user_id),status=C(b.status);if(!id||!["active","suspended","revoked"].includes(status))return J({error:"Customer and valid portal status are required."},400);
   const existing=await db.from("testing_customer_portal_access").select("*").eq("user_id",id).maybeSingle();if(existing.error)throw existing.error;
   const row:any={user_id:id,status,access_source:existing.data?.access_source||"admin",updated_at:N(),updated_by:user.id,metadata:{...(existing.data?.metadata||{}),managed_from:"testing_management"}};
   if(status==="active"){row.first_enabled_at=existing.data?.first_enabled_at||N();row.suspended_at=null;row.revoked_at=null}
   if(status==="suspended")row.suspended_at=N();
   if(status==="revoked")row.revoked_at=N();
   const q=existing.data?await db.from("testing_customer_portal_access").update(row).eq("id",existing.data.id).select("*").single():await db.from("testing_customer_portal_access").insert({id:crypto.randomUUID(),...row}).select("*").single();if(q.error)throw q.error;
   await log(db,id,user.id,"portal_access_"+status,C(b.notes)||null,{portal_access_id:q.data.id});return J({portal_access:q.data});
  }
  if(a==="add_membership"){
   const uid=C(b.user_id),employerId=C(b.employer_id);if(!uid||!employerId)return J({error:"Customer and employer are required."},400);
   const ex=await db.from("testing_employer_members").select("*").eq("user_id",uid).eq("employer_id",employerId).maybeSingle();if(ex.error)throw ex.error;
   const row:any={employer_id:employerId,user_id:uid,role_code:C(b.role_code)||"member",status:"active",is_primary:Boolean(b.is_primary),title:C(b.title)||null,department:C(b.department)||null,is_company_superadmin:Boolean(b.is_company_superadmin),updated_at:N()};
   const q=ex.data?await db.from("testing_employer_members").update(row).eq("id",ex.data.id).select("*").single():await db.from("testing_employer_members").insert({id:crypto.randomUUID(),...row,invited_at:N(),joined_at:N(),created_at:N()}).select("*").single();if(q.error)throw q.error;
   await log(db,uid,user.id,"employer_membership_saved",C(b.notes)||null,{membership_id:q.data.id,employer_id:employerId});return J({membership:q.data});
  }
  if(a==="remove_membership"){
   const mid=C(b.membership_id);if(!mid)return J({error:"Membership id is required."},400);
   const ex=await db.from("testing_employer_members").select("*").eq("id",mid).maybeSingle();if(ex.error)throw ex.error;if(!ex.data)return J({error:"Membership not found."},404);
   const q=await db.from("testing_employer_members").update({status:"inactive",is_primary:false,is_company_superadmin:false,updated_at:N()}).eq("id",mid).select("*").single();if(q.error)throw q.error;
   await log(db,ex.data.user_id,user.id,"employer_membership_removed",C(b.notes)||null,{membership_id:mid,employer_id:ex.data.employer_id});return J({membership:q.data});
  }
  return J({error:"Unsupported Testing customer action."},400);
 }catch(e:any){console.error("testing-customer-management",e);return J({error:e instanceof Error?e.message:String(e)},Number(e?.status||500))}
});