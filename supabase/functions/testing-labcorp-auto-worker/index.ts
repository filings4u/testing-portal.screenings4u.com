
import { createClient } from "npm:@supabase/supabase-js@2";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
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
