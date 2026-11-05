/**
 * Mindful Space — Cloudflare Worker proxy for Gemini.
 * Store GEMINI_API_KEY as a Worker Secret; never put it in the app or repository.
 */
const HEADERS={"Content-Type":"application/json; charset=utf-8"};
const SYSTEM_INSTRUCTION=`Ты — бережный помощник приложения Mindful Space.
Отвечай по-русски, спокойно, уважительно и без осуждения. Отрази суть сообщения и предложи один небольшой реалистичный шаг или задай один уместный вопрос.
Не ставь диагнозы, не назначай лечение, не представляйся врачом или психологом. Не обещай абсолютную конфиденциальность. Не проси личные данные.
Если человек сообщает о непосредственной опасности или риске причинения вреда себе/другим, предложи сразу обратиться к доверенному взрослому/человеку рядом и в местную экстренную службу. Не описывай опасные действия подробно.
Обычно отвечай 2–5 короткими предложениями. Ты не заменяешь профессиональную или экстренную помощь.`;
function reply(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{...HEADERS,"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin","Cache-Control":"no-store"}})}
export default {async fetch(request,env){
 const origin=request.headers.get("Origin")||"null";
 if(origin!=="null"&&origin!=="https://mindful-space.example")return reply({error:"Origin not allowed"},403,"null");
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"}});
 if(request.method!=="POST")return reply({error:"Method not allowed"},405,origin);
 if(!env.GEMINI_API_KEY)return reply({error:"Worker is not configured"},503,origin);
 const size=Number(request.headers.get("Content-Length")||0);if(size>16000)return reply({error:"Request too large"},413,origin);
 let body;try{body=await request.json()}catch{return reply({error:"Invalid JSON"},400,origin)}
 if(!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>12)return reply({error:"Invalid messages"},400,origin);
 const contents=[];
 for(const m of body.messages){if(!m||!["user","model"].includes(m.role)||typeof m.text!=="string")return reply({error:"Invalid message"},400,origin);const t=m.text.trim().slice(0,1800);if(t)contents.push({role:m.role,parts:[{text:t}]})}
 if(!contents.length||contents[contents.length-1].role!=="user")return reply({error:"Last message must be user"},400,origin);
 // Add a Cloudflare rate-limiting rule before sharing this endpoint publicly.
 const model=env.GEMINI_MODEL||"gemini-3.8-flash";
 let upstream;try{upstream=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify({system_instruction:{parts:[{text:SYSTEM_INSTRUCTION}]},contents,generationConfig:{temperature:0.7,maxOutputTokens:500}})})}catch{return reply({error:"Provider unavailable"},502,origin)}
 const result=await upstream.json().catch(()=>({}));if(!upstream.ok)return reply({error:"Provider error"},502,origin);
 const text=result?.candidates?.[0]?.content?.parts?.map(p=>typeof p.text==="string"?p.text:"").join("").trim();
 if(!text)return reply({error:"Empty response"},502,origin);
 return reply({reply:text},200,origin);
}};