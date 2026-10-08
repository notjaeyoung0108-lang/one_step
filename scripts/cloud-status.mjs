import {readFile} from 'node:fs/promises';
import path from 'node:path';
const config=await readFile(path.join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml'),'utf8');
const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw Error('Cloudflare login missing');
for(const endpoint of ['user','accounts/ecaf101559b505f23f3c8dddf26cd150/workers/subdomain']){
  const r=await fetch('https://api.cloudflare.com/client/v4/'+endpoint,{headers:{Authorization:'Bearer '+token}});const body=await r.json();
  console.log(JSON.stringify(endpoint==='user'?{emailVerified:body.result?.email_verified??body.result?.verified,success:body.success}:{workersSubdomain:body.result?.subdomain,success:body.success}));
}
