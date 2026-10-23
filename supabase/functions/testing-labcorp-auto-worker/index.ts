
import { createClient } from "npm:@supabase/supabase-js@2";

const DEV_PANELS: Record<string, string[]> = {
  "01109090": ["806698"],
  "393166": ["4549490002"],
  "576898": ["PCA-10X3S-LC"],
  "576899": [
    "4552950001",
    "4552950002",
    "4552950003",
    "4552950004",
    "4552950005",
    "4552950006",
    "4552950007",
    "4552950008",
    "4552950009",
    "4552950010",
  ],
};

const DOT_AUTHORITIES = new Set([
  "FMCSA",
  "FAA",
  "FRA",
  "FTA",
  "PHMSA",
  "USCG",
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return `<data:${name}>${xmlEscape(value)}</data:${name}>`;
}

function xmlText(xml: string, name: string): string {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,
    "i",
  );

  const match = xml.match(pattern);

  return match?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
}

function registrationXml(order: any): string {
  const account = String(order.account_number ?? "");
  const isHair = account === "01109090";
  const isInstant = account === "576898";
  const isDot = account === "393166";
  const testingAuthority = String(order.testing_authority ?? "").trim().toUpperCase();

  if (isDot && !DOT_AUTHORITIES.has(testingAuthority)) {
    throw new Error("Invalid DOT testing authority");
  }

  const reason = String(order.donor_reason_for_test ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(reason)) {
    throw new Error("Reason-for-test must be a two-character code");
  }

  const state = String(order.donor_state_of_residence ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error("Donor state must be a two-character code");
  }

  const expirationDate = new Date(order.registration_expiration_at);
  if (!Number.isFinite(expirationDate.getTime()) ||
      expirationDate.getTime() <= Date.now()) {
    throw new Error("Registration expiration must be in the future");
  }

  const birthDate = order.donor_date_of_birth
    ? new Date(`${order.donor_date_of_birth}T00:00:00Z`).toISOString()
    : "";

  const panels = (order.panel_ids as string[])
    .map((id) => tag("panelId", id))
    .join("");

  // Hair and point-of-care tests must not request split specimens.
  const splitRequested = !isHair && !isInstant &&
    (isDot || Boolean(order.split_specimen_requested));
  const observedRequested = !isHair &&
    Boolean(order.observed_collection_requested);

  return (
    `<ws:registration xmlns:data="http://data.ws.ots.labcorp.com">` +
    tag("clientRegistrationId", order.client_registration_id || order.labcorp_order_number) +
    tag("donorDateOfBirth", birthDate) +
    tag("donorId", order.donor_id) +
    tag("cdl_state", order.cdl_state) +
    tag("cdl_number", order.cdl_number) +
    tag("donorNameFirst", order.donor_first_name) +
    tag("donorNameLast", order.donor_last_name) +
    tag("donorNameMiddleInitial", order.donor_middle_initial) +
    tag("donorReasonForTest", reason) +
    tag("donorStateOfResidence", state) +
    tag("observedCollectionRequested", String(observedRequested)) +
    panels +
    tag("registrationExpirationDate", expirationDate.toISOString()) +
    tag("splitSpecimenRequested", String(splitRequested)) +
    tag("accountLocationCode", order.account_location_code) +
    tag("accountNumber", account) +
    tag("testingAuthority", testingAuthority) +
    `</ws:registration>`
  );
}

async function registerWithLabcorp(
  order: any,
): Promise<string> {
  const endpoint =
    Deno.env.get("LABCORP_OTS_ENDPOINT") ||
    "https://services-cert.labcorpsolutions.com/webservice/services/LabcorpOTS";

  const username = Deno.env.get("LABCORP_OTS_USER");
  const password = Deno.env.get("LABCORP_OTS_PASSWORD");

  if (!username || !password) {
    throw new Error("Labcorp DEV credentials missing");
  }

  const endpointUrl = new URL(endpoint);

  if (
    endpointUrl.protocol !== "https:" ||
    endpointUrl.hostname !==
      "services-cert.labcorpsolutions.com"
  ) {
    throw new Error("Invalid Labcorp DEV endpoint");
  }

  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope ` +
    `xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:ws="http://ws.ots.labcorp.com">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<ws:registerDonor>` +
    `<ws:userId>${xmlEscape(username)}</ws:userId>` +
    `<ws:password>${xmlEscape(password)}</ws:password>` +
    registrationXml(order) +
    `</ws:registerDonor>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "registerDonor",
    },
    body: envelope,
    signal: AbortSignal.timeout(25000),
  });

  const responseXml = await response.text();

  if (
    !response.ok ||
    /<(?:[\w.-]+:)?Fault\b/i.test(responseXml)
  ) {
    throw new Error(
      `Labcorp registration failed: HTTP ${response.status}`,
    );
  }

  if (!/<(?:[\w.-]+:)?registerDonorResponse\b/i.test(responseXml)) {
    throw new Error("Unexpected Labcorp SOAP response");
  }

  const registrationNumber = xmlText(
    responseXml,
    "labcorpRegistrationNumber",
  );

  if (
    !/^\d+$/.test(registrationNumber) ||
    BigInt(registrationNumber) <= 0n
  ) {
    throw new Error(
      "Labcorp did not return a valid registration number",
    );
  }

  return registrationNumber;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (
    !supabaseUrl ||
    !serviceKey ||
    req.headers.get("Authorization") !==
      `Bearer ${serviceKey}`
  ) {
    return json({ error: "Unauthorized" }, 401);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const input = await req.json().catch(() => ({}));

    const orderId = String(input.order_id || "").trim();

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(orderId)) {
      return json(
        { error: "Valid order_id required" },
        400,
      );
    }

    const { data: payment, error: paymentError } =
      await db
        .from("orders")
        .select("id,payment_status,paid_at")
        .eq("id", orderId)
        .maybeSingle();

    if (paymentError) throw paymentError;

    if (!payment) {
      return json({ error: "Order not found" }, 404);
    }

    if (
      payment.payment_status !== "paid" ||
      !payment.paid_at
    ) {
      return json(
        { error: "Confirmed payment required" },
        409,
      );
    }

    const { data: records, error: recordsError } =
      await db
        .from("testing_labcorp_orders")
        .select("*")
        .eq("order_id", orderId);

    if (recordsError) throw recordsError;

    const results: Array<Record<string, unknown>> = [];

    for (const record of records || []) {
      if (record.labcorp_registration_number) {
        results.push({id:record.id,state:"already_registered"});
        continue;
      }
      if (record.status !== "draft") {
        results.push({id:record.id,state:"manual_reconciliation_required"});
        continue;
      }
      const upstream=await fetch(supabaseUrl+"/functions/v1/testing-labcorp-register-shared",{
        method:"POST",
        headers:{"Authorization":"Bearer "+serviceKey,"apikey":serviceKey,"Content-Type":"application/json"},
        body:JSON.stringify({labcorp_order_id:record.id,mode:"automatic"}),
        signal:AbortSignal.timeout(35000)
      });
      const result=await upstream.json().catch(()=>({error:"Invalid registration response; reconciliation required"}));
      results.push({id:record.id,state:upstream.ok?(result.already_registered?"already_registered":"registered"):(result.reconciliation_required?"manual_reconciliation_required":"blocked"),reason:upstream.ok?undefined:(result.error||"Registration unavailable")});
    }

    return json({
      order_id: orderId,
      results,
    });
  } catch (error) {
    console.error(
      "Labcorp worker failed:",
      error instanceof Error
        ? error.message
        : "Unknown error",
    );

    return json(
      { error: "Worker failed" },
      500,
    );
  }
});
