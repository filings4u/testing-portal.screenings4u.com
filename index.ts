import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return json({error:'Authentication required'},401);
  const url=Deno.env.get('SUPABASE_URL')||'';
  const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
  const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const auth=createClient(url,anon,{auth:{persistSession:false}});
  const user=await auth.auth.getUser(token);
  if(user.error||!user.data.user)return json({error:'Authentication required'},401);
  const db=createClient(url,svc,{auth:{persistSession:false}});
  const [staff,access]=await Promise.all([
   db.from('staff_profiles').select('employment_status').eq('user_id',user.data.user.id).maybeSingle(),
   db.from('staff_business_access').select('access_level,active').eq('user_id',user.data.user.id).eq('business_unit_code','testing').eq('active',true).maybeSingle()
  ]);
  if(staff.error||access.error)return json({error:'Authorization lookup unavailable'},503);
  if(staff.data?.employment_status!=='active'||!access.data||!['owner','admin','super_admin','full'].includes(String(access.data.access_level).toLowerCase()))return json({error:'Testing administrator access required'},403);
  if(Deno.env.get('LABCORP_ROTATION_ENABLED')!=='true')return json({error:'Rotation is not enabled'},423);
  const endpoint=Deno.env.get('LABCORP_OTS_ENDPOINT')||'https://services-cert.labcorpsolutions.com/webservice/services/LabcorpOTS';
  if(endpoint!=='https://services-cert.labcorpsolutions.com/webservice/services/LabcorpOTS')return json({error:'Certification endpoint required'},409);
  const username=Deno.env.get('LABCORP_OTS_USER')||'';
  const previous=Deno.env.get('LABCORP_OTS_PASSWORD')||'';
  const next=Deno.env.get('LABCORP_OTS_NEW_PASSWORD')||'';
  if(!username||!previous||!next)return json({error:'Missing OTS password secrets'},503);
  if(next===previous||next.length<7||next.length>32||!/[a-zA-Z]/.test(next)||!/[0-9]/.test(next))return json({error:'New password does not meet requirements'},422);
  const xml=`<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.ots.labcorp.com"><soapenv:Header/><soapenv:Body><ws:changePassword><ws:userId>${esc(username)}</ws:userId><ws:password>${esc(previous)}</ws:password><ws:newPassword>${esc(next)}</ws:newPassword></ws:changePassword></soapenv:Body></soapenv:Envelope>`;
  const result=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8','SOAPAction':'changePassword'},body:xml,signal:AbortSignal.timeout(15000)});
  const response=await result.text();
  if(!result.ok||/<(?:\w+:)?Fault\b/i.test(response)){
   const fault=response.match(/<(?:\w+:)?faultstring>([^<]*)<\/(?:\w+:)?faultstring>/i)?.[1]||`SOAP HTTP ${result.status}`;
   return json({ok:false,error:fault.slice(0,250)},502);
  }
  if(!/<(?:\w+:)?changePasswordResponse(?:\s|>|\/)/i.test(response))return json({ok:false,error:'Unrecognized Labcorp success response; verify with Labcorp before retry'},502);
  return json({ok:true,message:'Labcorp accepted changePassword. Update LABCORP_OTS_PASSWORD to the new value, remove the temporary new-password secret, and disable this function. Do not invoke again.'});
 }catch{return json({error:'Password change attempt failed; inspect secure function logs before retrying'},502)}
});
