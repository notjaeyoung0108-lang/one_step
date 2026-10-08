import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomBytes,createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
await mkdir(new URL('private/',root),{recursive:true});
let token;
try{token=(await readFile(new URL('private/access-token.txt',root),'utf8')).trim();}catch{token='step_'+randomBytes(32).toString('base64url');await writeFile(new URL('private/access-token.txt',root),token+'\n');}
const source=parseEnv(await readFile(new URL('../../../.env',import.meta.url),'utf8'));
if(!source.OPENAI_API_KEY)throw Error('Workspace OPENAI_API_KEY is missing');
await writeFile(new URL('.dev.vars',root),`ACCESS_TOKEN_HASH=${createHash('sha256').update(token).digest('hex')}\nOPENAI_API_KEY=${source.OPENAI_API_KEY}\n`);
await writeFile(new URL('private/deploy-secrets.json',root),JSON.stringify({ACCESS_TOKEN_HASH:createHash('sha256').update(token).digest('hex'),OPENAI_API_KEY:source.OPENAI_API_KEY}));
console.log('Prepared local credentials and deployment secrets (values hidden).');
