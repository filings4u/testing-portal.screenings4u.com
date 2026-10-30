/** Labcorp OTS registration for certification and production. Never log XML, credentials or donor data. */
export const DEV_PANELS:Record<string,string[]>={"01109090":["806698"],"393166":["4549490002"],"576898":["PCA-10X3S-LC"],"576899":Array.from({length:10},(_,i)=>String(4552950001+i))};
export type Registration={account_number:string;account_location_code?:string|null;panel_ids:string[];client_registration_id:string;donor_first_name:string;donor_last_name:string;donor_middle_initial?:string|null;donor_date_of_birth?:string|null;donor_id?:string|null;cdl_state?:string|null;cdl_number?:string|null;donor_reason_for_test:string;donor_state_of_residence:string;observed_collection_requested?:boolean;split_specimen_requested?:boolean;registration_expiration_at:string;testing_authority?:string|null};
export class LabcorpError extends Error {constructor(message:string,public readonly code:string="",public readonly element:string=""){super(message);this.name="LabcorpError"}}
const esc=(v:unknown)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const el=(n:string,v:unknown)=>v===null||v===undefined||v===""?"":`<data:${n}>${esc(v)}</data:${n}>`;
const DOT=new Set(["FMCSA","FAA","FRA","FTA","PHMSA","USCG"]);
const check=(v:unknown,msg:string)=>{if(!v)throw new LabcorpError(msg)};
function tag(xml:string,n:string){const m=new RegExp("<(?:[\\w.-]+:)?"+n+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+n+">","i").exec(xml);return(m?.[1]||"").replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").trim()}
export function validate(r:Registration,environment:"cert"|"prod"="cert"){
 check(environment==="cert"||environment==="prod","Invalid Labcorp environment");
 if(environment==="cert")check(DEV_PANELS[r.account_number]&&r.panel_ids?.length===1&&DEV_PANELS[r.account_number].includes(r.panel_ids[0]),"DEV account/panel mismatch");
 else check(Boolean(r.account_number?.trim())&&Array.isArray(r.panel_ids)&&r.panel_ids.length>0&&r.panel_ids.every(p=>typeof p==="string"&&p.trim().length>0),"Production account and approved panel IDs required");
 check(r.client_registration_id?.length>0&&r.client_registration_id.length<=50,"Invalid client registration ID");
 check(r.donor_first_name?.length>0&&r.donor_first_name.length<=25,"Invalid first name");
 check(r.donor_last_name?.length>0&&r.donor_last_name.length<=35,"Invalid last name");
 check(!r.donor_middle_initial||r.donor_middle_initial.length<=1,"Invalid middle initial");
 check(!r.donor_id||r.donor_id.length<=12,"Invalid donor ID");
 check(!r.cdl_number||r.cdl_number.length<=19,"Invalid CDL number");
 check(/^[A-Z]{2}$/.test(r.donor_state_of_residence),"Invalid residence state");
 check(/^[A-Z0-9]{2}$/.test(r.donor_reason_for_test),"Invalid reason for test");
 check(!r.donor_date_of_birth||/^\d{4}-\d{2}-\d{2}$/.test(r.donor_date_of_birth),"Invalid DOB");
 check(!r.testing_authority||["HHS","NRC",...DOT].includes(r.testing_authority),"Invalid testing authority");
 if(environment==="cert")check(r.account_number!=="393166"||DOT.has(r.testing_authority||""),"DOT testing authority required");
 check(Number.isFinite(Date.parse(r.registration_expiration_at))&&Date.parse(r.registration_expiration_at)>Date.now(),"Invalid registration expiration");
}
export function registrationXml(r:Registration,environment:"cert"|"prod"="cert"){validate(r,environment);return '<ws:registration xmlns:data="http://data.ws.ots.labcorp.com">'+el("clientRegistrationId",r.client_registration_id)+el("donorDateOfBirth",r.donor_date_of_birth?r.donor_date_of_birth+"T00:00:00":"")+el("donorId",r.donor_id)+el("cdl_state",r.cdl_state)+el("cdl_number",r.cdl_number)+el("donorNameFirst",r.donor_first_name)+el("donorNameLast",r.donor_last_name)+el("donorNameMiddleInitial",r.donor_middle_initial)+el("donorReasonForTest",r.donor_reason_for_test)+el("donorStateOfResidence",r.donor_state_of_residence)+el("observedCollectionRequested",Boolean(r.observed_collection_requested))+r.panel_ids.map(p=>el("panelId",p)).join("")+el("registrationExpirationDate",new Date(r.registration_expiration_at).toISOString().replace(/\.000Z$/,"Z"))+el("splitSpecimenRequested",DOT.has(r.testing_authority||"")||Boolean(r.split_specimen_requested))+el("accountLocationCode",r.account_location_code)+el("accountNumber",r.account_number)+el("testingAuthority",r.testing_authority)+"</ws:registration>"}
export async function registerDonor(r:Registration,config:{endpoint:string;user:string;password:string;environment?:"cert"|"prod"}){
 const environment=config.environment||"cert";
 const approvedHost=environment==="prod"?"services.labcorpsolutions.com":"services-cert.labcorpsolutions.com";
 const url=new URL(config.endpoint);check(url.protocol==="https:"&&url.hostname===approvedHost&&url.pathname==="/webservice/services/LabcorpOTS"&&!url.username&&!url.password&&!url.search&&!url.hash,"Labcorp endpoint does not match selected environment");check(config.user&&config.password,"Missing credentials");
 const envelope='<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.ots.labcorp.com"><soapenv:Header/><soapenv:Body><ws:registerDonor><ws:userId>'+esc(config.user)+'</ws:userId><ws:password>'+esc(config.password)+'</ws:password>'+registrationXml(r,environment)+'</ws:registerDonor></soapenv:Body></soapenv:Envelope>';
 const resp=await fetch(config.endpoint,{method:"POST",headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:"registerDonor"},body:envelope,signal:AbortSignal.timeout(25000)});const xml=await resp.text();
 const code=tag(xml,"errorCode"),element=tag(xml,"errorElement");
 if(!resp.ok||code||tag(xml,"errorDescription")||/<(?:[\\w.-]+:)?Fault\\b/i.test(xml))throw new LabcorpError("Labcorp rejected registration",code,element);
 const number=tag(xml,"labcorpRegistrationNumber");if(!/^\d+$/.test(number)||BigInt(number)<=0n)throw new LabcorpError("Missing Labcorp registration number; reconcile before retry");
 return {registrationNumber:number,registrationDateTime:tag(xml,"registrationDateTime")||tag(xml,"registrationTime")||null};
}
