// Mindful Space proxy placeholder. External AI forwarding is deliberately disabled.
const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(body,status=503)=>new Response(JSON.stringify(body),{status,headers});
export default {async fetch(request){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"}});
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 return json({error:"External AI is disabled pending provider-policy and safety review.",code:"PROVIDER_INTEGRATION_DISABLED"},503);
}};
