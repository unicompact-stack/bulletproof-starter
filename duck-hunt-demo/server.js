const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
let state = { seq: 0, x: .5, y: .5, fire: false, lastSeen: 0 };
function localIp() { const nets=os.networkInterfaces(); for(const list of Object.values(nets)) for(const n of list||[]) if(n.family==='IPv4'&&!n.internal)return n.address; return '127.0.0.1'; }
const token = crypto.randomBytes(4).toString('hex');
function json(res, code, body) { const out=JSON.stringify(body); res.writeHead(code, {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}); res.end(out); }
function body(req) { return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch(e){reject(e)}})}); }
const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname==='/api/info') return json(res,200,{phoneUrl:`http://${localIp()}:${PORT}/phone.html?token=${token}`,token});
  if(url.pathname==='/api/state') { const out={...state}; state.fire=false; return json(res,200,out); }
  if(url.pathname==='/api/input' && req.method==='POST') { try { const b=await body(req); state={seq:state.seq+1,x:Math.max(0,Math.min(1,Number(b.x)||0)),y:Math.max(0,Math.min(1,Number(b.y)||0)),fire:Boolean(b.fire),lastSeen:Date.now()}; return json(res,200,{ok:true,seq:state.seq}); } catch(e) { return json(res,400,{ok:false}); } }
  let file=url.pathname==='/'?'/index.html':url.pathname; if(file==='/phone')file='/phone.html'; const full=path.normalize(path.join(ROOT,file)); if(!full.startsWith(ROOT)||!fs.existsSync(full)||!fs.statSync(full).isFile())return json(res,404,{error:'Not found'}); const ext=path.extname(full); const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'}; res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});fs.createReadStream(full).pipe(res);
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Tир: http://localhost:${PORT}/  |  Телефон: http://${localIp()}:${PORT}/phone.html?token=${token}`));
