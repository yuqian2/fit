// ============================================================
// AI 打标签 & 搭配 Edge Function
// 部署：bash deploy-ai.sh（或 deploy-ai.bat）
// 环境变量：ZHIPU_API_KEY（由部署脚本 supabase secrets set 自动设置）
// ============================================================

const ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

// ============================================================
// 模型白名单护栏：只允许免费模型，防止误用收费模型产生费用
// ============================================================
const FREE_MODELS = ["glm-4v-flash"];   // 唯一允许的（免费）模型
const MODEL = FREE_MODELS[0];           // 硬编码固定为免费模型，不接受外部传入

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS 预检
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ZHIPU_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "服务端未配置 AI Key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, imageBase64, prompt, model } = body;

    // ---- 护栏：拒绝任何非免费模型的请求 ----
    // 前端正常调用不会传 model；即使有人恶意传了收费模型名，也会被这里拦下。
    if (model && model !== MODEL) {
      return new Response(JSON.stringify({ error: "禁止调用非白名单模型：" + model }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // ---- 双重保险：发请求前再次断言模型名，防止代码被意外篡改 ----
    if (!FREE_MODELS.includes(MODEL)) {
      return new Response(JSON.stringify({ error: "模型配置异常，已阻止调用" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 构造消息
    let messages;
    if (action === "tag") {
      // 打标签：识别衣服
      messages = [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageBase64 } },
          { type: "text", text: "你是时尚专家。识别这件衣服，只输出一个严格JSON（不要markdown、不要其他文字）：{\"name\":\"简短名称\",\"category\":\"上装/下装/外套/连衣裙/鞋/配饰之一\",\"color\":\"颜色\",\"material\":\"材质\",\"style\":\"风格\",\"tags\":[\"标签1\",\"标签2\"]}" }
        ]
      }];
    } else if (action === "match") {
      // 新衣匹配：识别新衣 + 从衣柜挑搭配
      messages = [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageBase64 } },
          { type: "text", text: prompt }
        ]
      }];
    } else {
      // 纯文本搭配建议
      messages = [{ role: "user", content: prompt }];
    }

    const resp = await fetch(ZHIPU_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.7 }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ error: "AI 调用失败：" + resp.status, detail: err }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
