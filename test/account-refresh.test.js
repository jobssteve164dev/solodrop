const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('refresh updates Pro choices after purchase even when a local editor is active',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'solodrop-account-refresh-'));
  const file=path.join(directory,'review.txt');fs.writeFileSync(file,'review');
  const originalLoad=Module._load,previousFetch=globalThis.fetch;
  const vscode={window:{activeTextEditor:{document:{uri:{scheme:'file',fsPath:file}}}},workspace:{getConfiguration:()=>({get:()=> 'en'})},env:{language:'en'}};
  Module._load=function(name,...args){return name==='vscode'?vscode:originalLoad.call(this,name,...args);};
  let accountReads=0;
  globalThis.fetch=async()=>{accountReads++;return Response.json({user:{id:'user',email:'member@example.com'},pro:true,maxFileBytes:104857600,expiryDays:[1,7,30],features:['password','remove_branding']});};
  try{
    const {SoloDropSidebarProvider}=require('../out/sidebarProvider.js');
    const provider=new SoloDropSidebarProvider({secrets:{get:async()=> 'session'},globalState:{get:(_key,fallback)=>fallback}},{appendLine(){}});
    const messages=[];provider.view={webview:{postMessage:message=>{messages.push(message);}}};
    await provider.handleMessage({command:'refresh'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(accountReads,1);
    assert.ok(messages.some(message=>message.command==='selectionChanged'));
    assert.ok(messages.some(message=>message.command==='accountLoaded'&&message.account.pro));
  }finally{Module._load=originalLoad;globalThis.fetch=previousFetch;fs.unlinkSync(file);fs.rmdirSync(directory);}
});
