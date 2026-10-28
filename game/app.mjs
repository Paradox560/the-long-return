import {createCampaign,getRegion,movePlayer,nearbyTargets,interact,executeAction,interpretLocalIntent,summarizeForDM,validateSave} from './engine.mjs';
import {WorldRenderer} from './render.mjs';

const $=id=>document.getElementById(id);
const SAVE='long-return-campaign-v1';
const keys=new Set();
const renderer=new WorldRenderer($('world'));
let state=createCampaign({name:'Avery',setting:'A marsh frontier of old villages and forgotten flood engines',tone:'Wistful & mysterious',premise:'A wandering surveyor searching for a missing mentor.',seed:'bellwether'});
let connectionRequest=0,connection={},saved=null,started=false,busy=false,live=false,session=0,selected=null,toastTimer,arrivalTimer,recognition,requestAbort;
let lastTime=performance.now(),lastSave=0,lastUI=0,currentRegion=state.regionId;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

try {const raw=localStorage.getItem(SAVE); if(raw)saved=validateSave(JSON.parse(raw));} catch {toast('The previous save could not be loaded. You can start a new journey or import a backup.');}
$('continue-button').hidden=!saved;
$('welcome').showModal();
$('welcome').addEventListener('cancel',e=>{if(!started)e.preventDefault();});
$('welcome').addEventListener('close',()=>{if(!started&&!$('welcome').open)$('welcome').showModal();});

function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function save(){if(!started)return;try{localStorage.setItem(SAVE,JSON.stringify(state));$('save-status').textContent='Saved on this device';}catch{$('save-status').textContent='Save unavailable — export a backup';}lastSave=performance.now();}
function scene(result,label='The chronicler'){
 if(!result)return;$('scene-title').textContent=result.title||'A moment on the road';$('scene-text').textContent=result.text||result.narration||'';$('scene-label').textContent=label;
 $('choices').replaceChildren();
 for(const choice of (result.choices||[])) {const b=document.createElement('button');b.type='button';b.className='choice';b.textContent=choice.label;b.addEventListener('click',()=>perform(choice.id,Object.hasOwn(choice,'targetId')?choice.targetId:selected));$('choices').append(b);}
}
function refresh(){
 const region=getRegion(state);$('region-name').textContent=region.name;$('region-description').textContent=region.description||'A path into the unknown.';$('traveler-name').textContent=state.campaign?.name||'The surveyor';
 const hp=state.player.hp??20,max=state.player.maxHp??20;$('health').textContent=`${hp} / ${max} vitality`;$('health-fill').style.width=`${Math.max(0,hp/max)*100}%`;
 $('clock').textContent=`Day ${state.day??1} · ${state.combat?'In combat':'On the road'}`;$('objective').textContent=state.objective||'Explore the road and speak to the people you meet.';
 document.body.dataset.region=state.regionId;document.body.dataset.day=state.day;document.body.dataset.revision=state.revision;
 const near=nearbyTargets(state);const button=$('interact-button');button.hidden=!started||!near.length||!!state.combat;
 if(near.length)button.querySelector('span').textContent=near[0].name||near[0].label||'Investigate';
 if(state.regionId!==currentRegion){currentRegion=state.regionId;selected=null;scene({title:region.name,text:region.description,choices:[]},'A new stretch of road');showArrival(region.name);save();}
}
function showArrival(name){clearTimeout(arrivalTimer);$('arrival').textContent=name;$('arrival').hidden=false;arrivalTimer=setTimeout(()=>$('arrival').hidden=true,2200);}
function inspect(target){if(!started)return;const near=nearbyTargets(state);const t=typeof target==='string'?near.find(x=>x.id===target):near[0];if(!t){toast('Walk closer to a person or landmark, then press E.');return;}selected=t.id;const result=interact(state,t.id);scene(result,t.name||t.label||'A discovery');refresh();save();}
function perform(actionId,targetId){if(!started)return;const before=state.journal?.length||0;const result=executeAction(state,actionId,targetId);scene(result);refresh();save();if((state.journal?.length||0)>before){const e=state.journal.at(-1);$('recent-event').textContent=`Journal updated · ${e.title}`;$('recent-event').hidden=false;}}
function begin(useSaved=false){requestAbort?.abort();session++;state=useSaved&&saved?saved:createCampaign({name:$('campaign-name').value.trim()||'Avery',setting:$('campaign-setting').value.trim(),tone:$('campaign-tone').value,premise:$('campaign-premise').value.trim(),seed:$('campaign-seed').value.trim()||'bellwether'});started=true;currentRegion=state.regionId;selected=null;keys.clear();$('welcome').close();scene({title:useSaved?'The road remembers you':'A road through the reeds',text:useSaved?'Your journey continues where you left it. Your choices, discoveries, and the people you met are still here.':'Water whispers through the reeds. An old marker stands beside the road. Follow the path east to Bellwether, and ask about the failing spillway.',choices:[]},useSaved?'Welcome back':'Your journey begins');refresh();save();showArrival(getRegion(state).name);if(state.combat)scene(interact(state,'scavenger'),'An unfinished encounter');$('world').focus();}
$('campaign-form').addEventListener('submit',e=>{e.preventDefault();if(saved){try{localStorage.setItem(SAVE+'-previous',JSON.stringify(saved));}catch{}}begin();});
$('continue-button').addEventListener('click',()=>begin(true));
$('interact-button').addEventListener('click',()=>inspect());

function openPanel(title,html){keys.clear();$('panel-title').textContent=title;$('panel-content').innerHTML=html;if(!$('panel').open)$('panel').showModal();}
function journal(){const items=state.inventory||[];openPanel('Your field journal',`<span class="small-label">In your satchel</span><div class="inventory">${items.length?items.map(x=>`<span>${escape(typeof x==='string'?x:x.name||x.id)}</span>`).join(''):'<span>No collected items yet</span>'}</div><span class="small-label">What you remember</span>${(state.journal||[]).slice().reverse().map(e=>`<article class="journal-entry"><small>Day ${escape(e.day)}</small><h3>${escape(e.title)}</h3><p>${escape(e.text)}</p></article>`).join('')||'<p>Your first discovery is waiting beside the road.</p>'}`);}
function map(){const labels={reedway:'The Reedway',bellwether:'Bellwether',uplands:'Upland Station'};openPanel('The marsh frontier',`<p>The old survey road runs west to east. Follow its pale stones to reach the next region. A place on this map keeps its name even when its story changes.</p><div class="route-map">${Object.entries(labels).map(([id,name],i)=>`<div class="route-stop ${state.regionId===id?'current':''}"><span>${state.regionId===id?'You are here':i===0?'West':i===1?'The village':'East'}</span><strong>${name}</strong></div>`).join('')}</div><p><strong>Your thread:</strong> ${escape(state.objective)}</p><p>Visit the uplands, rest at camp for three nights, then walk back to Bellwether. Repairing the spillway and moving the grain will shape what you find.</p>`);}
function dmInfo(){
 const local=connection.localSignInAvailable;
 const account=connection.account;
 let html=live?'<div class="live-notice"><p><strong>'+ (local?'ChatGPT plan connected.':'Live AI is configured.')+'</strong> Describe an intention in your own words. The chronicler interprets it using the current scene; the game validates range, resources, and consequences.</p></div>':'<div class="live-notice"><p><strong>This journey is using local storyteller rules.</strong> Movement, dialogue choices, exploration, combat, saving, and the changing village work now. Typed actions can trigger supported interactions.</p></div>';
 if(local){
  html+='<p>Connect an eligible ChatGPT Plus or Pro account to use your plan for the chronicler. You choose whether to allow plan usage on OpenAI’s sign-in screen. Your connection stays on this computer.</p>';
  if(account)html+=`<p><strong>${escape(account.name||account.label||'Your account')}</strong>${account.email?'<br>'+escape(account.email):''}</p>`;
  if(!live)html+='<div class="menu-actions"><a class="auth-link" href="/api/auth/start">Continue with ChatGPT →</a></div>';
  if(live){
   html+=`<label class="model-label" for="chatgpt-model">Chronicler model</label><select id="chatgpt-model">${(connection.models||[]).map(m=>`<option value="${escape(m.slug)}" ${m.slug===connection.selectedModel?'selected':''}>${escape(m.display_name||m.slug)}</option>`).join('')}</select><div class="menu-actions"><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener">Manage usage ↗</a><button id="disconnect-chatgpt">Disconnect</button></div>`;
  }
 }else if(!live){html+='<p>Live AI is not connected on this hosted version. Sign in with ChatGPT is available in the local personal version; hosted apps require OpenAI approval. A server API key is another supported connection.</p>';}
 html+='<p>Try “inspect the marker,” “talk to Mara,” “repair the sluice,” or “rest” nearby. The prototype supports a bounded set of actions. Movement and standard interactions stay local while an AI response is pending.</p><button id="refresh-connection" class="panel-action">Check connection</button>';
 openPanel('Your storyteller',html);
 $('refresh-connection').onclick=async()=>{await checkConnection();dmInfo();};
 if($('disconnect-chatgpt'))$('disconnect-chatgpt').onclick=async()=>{try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':connection.csrfToken||''},body:'{}'});if(!r.ok)throw Error();connectionRequest++;live=false;connection={};await checkConnection();dmInfo();}catch{toast('The connection could not be removed. Please try again.');}};
 if($('chatgpt-model'))$('chatgpt-model').onchange=async e=>{try{const r=await fetch('/api/auth/model',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':connection.csrfToken||''},body:JSON.stringify({model:e.target.value})});if(!r.ok)throw Error();await checkConnection();toast('Chronicler model updated.');}catch{toast('That model could not be selected.');dmInfo();}};
}
function menu(){openPanel('Your journey',`<p><strong>${escape(state.campaign?.name)}</strong> · Day ${escape(state.day)}</p><p>${escape(state.campaign?.premise)}</p><p>This prototype saves in this browser on this device. Export a backup before changing devices or clearing browser data.</p><div class="menu-actions"><button id="export-save">Export save</button><button id="import-save">Import save</button><button id="new-journey">New journey</button></div><p><a href="design.html" target="_blank" rel="noopener">Read the complete game design document ↗</a></p>`);$('export-save').onclick=exportSave;$('import-save').onclick=()=>$('import-file').click();$('new-journey').onclick=()=>{$('panel').close();saved=state;$('continue-button').hidden=false;$('welcome').showModal();};}
function exportSave(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='the-long-return-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Save exported.');}
$('import-file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>2e6)throw Error('large');const loaded=validateSave(JSON.parse(await file.text()));requestAbort?.abort();session++;state=loaded;started=true;currentRegion=state.regionId;selected=null;keys.clear();$('panel').close();scene({title:'A journey restored',text:'Your recorded world, discoveries, and choices have been restored.',choices:[]});if(state.combat)scene(interact(state,'scavenger'),'An unfinished encounter');refresh();save();toast('Save restored.');}catch{toast('This is not a valid Long Return save. Your current journey is unchanged.');}e.target.value='';};
$('journal-button').onclick=journal;$('map-button').onclick=map;$('menu-button').onclick=menu;$('dm-status').onclick=dmInfo;$('close-panel').onclick=()=>$('panel').close();$('panel').addEventListener('close',()=>{$('world').focus();keys.clear();});

$('intent-form').addEventListener('submit',async e=>{
 e.preventDefault();const message=$('intent').value.trim();if(!message||busy||!started)return;keys.clear();
 if(!live){selected=null;const answer=interpretLocalIntent(state,message);if(answer?.actionId)perform(answer.actionId,answer.targetId);else scene(answer||{title:'Try a nearby action',text:'Explore the scene, then name the person or object you want to interact with.'},'Local storyteller');if($('intent').value.trim()===message)$('intent').value='';refresh();save();return;}
 busy=true;$('send-button').disabled=true;$('intent-mode').textContent='Considering your intention…';requestAbort=new AbortController();const epoch=session,revision=state.revision,region=state.regionId;const timeout=setTimeout(()=>requestAbort.abort(),connection.localSignInAvailable?50000:22000);
 try{const response=await fetch('/api/dm',{method:'POST',headers:{'content-type':'application/json',...(connection.csrfToken?{'x-csrf-token':connection.csrfToken}:{})},body:JSON.stringify({message,context:summarizeForDM(state)}),signal:requestAbort.signal});const answer=await response.json();if(!response.ok||!answer.ok)throw Error(answer.error?.message||answer.message||'The chronicler is unavailable.');if(epoch!==session||region!==state.regionId||revision!==state.revision||answer.basedOnRevision!==revision){toast('The scene changed while that thought was forming. Please try again.');return;}if(answer.actionId){const result=executeAction(state,answer.actionId,answer.targetId);scene(result,'The chronicler · AI intention');}else scene({title:'The chronicler',text:answer.narration,choices:[]},'Live AI');if($('intent').value.trim()===message)$('intent').value='';refresh();save();}catch(error){toast(error.name==='AbortError'?'The chronicler took too long. Your intention is still here; no action was spent.':'The live chronicler is unavailable. Standard interactions still work.');}finally{clearTimeout(timeout);busy=false;$('send-button').disabled=false;$('intent-mode').textContent=live?'Interpreted by the live chronicler':'Grounded in local rules';}
});
$('intent').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('intent-form').requestSubmit();}});
const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!Speech){$('voice-button').hidden=true;}else{$('voice-button').onclick=()=>{if(recognition){recognition.stop();return;}recognition=new Speech();recognition.lang='en-US';recognition.interimResults=false;recognition.onresult=e=>{$('intent').value=e.results[0][0].transcript;$('intent').focus();toast('Review the transcript, then submit when ready.');};recognition.onerror=()=>toast('Speech was unavailable. You can still type your action.');recognition.onend=()=>{recognition=null;$('voice-button').textContent='Speak';};$('voice-button').textContent='Listening…';try{recognition.start();}catch{recognition=null;$('voice-button').textContent='Speak';}};}

function typing(){return ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);}
function paused(){return !started||$('welcome').open||$('panel').open||typing()||document.hidden;}
window.addEventListener('keydown',e=>{if(e.key==='Escape'){keys.clear();requestAbort?.abort();return;}if(typing()||$('welcome').open)return;if(e.key==='Enter'&&['BUTTON','A'].includes(document.activeElement?.tagName))return;if($('panel').open)return;const key=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)){e.preventDefault();keys.add(key);}if(!e.repeat){if(key==='e'){e.preventDefault();inspect();}if(key==='j')journal();if(key==='m')map();if(key==='enter'){e.preventDefault();$('intent').focus();}}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();save();});document.addEventListener('visibilitychange',()=>{keys.clear();if(document.hidden)save();});
const dirKeys={up:'w',left:'a',down:'s',right:'d'};
document.querySelectorAll('[data-direction]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(dirKeys[b.dataset.direction]);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(dirKeys[b.dataset.direction]));});
$('world').addEventListener('click',e=>{if(paused())return;const point=renderer.screenToWorld(e.clientX,e.clientY);if(!point)return;const px=point.x??point[0],py=point.y??point[1];const region=getRegion(state);const hit=[...region.npcs.map(n=>({...n,centered:true})),...region.objects.filter(o=>o.interactive)].find(o=>Math.abs(px-(o.x+(o.centered?0:(o.w||1)/2)))<Math.max(1.4,(o.w||1)/2)&&Math.abs(py-(o.y+(o.centered?0:(o.h||1)/2)))<Math.max(1.4,(o.h||1)/2));if(hit){if(nearbyTargets(state).some(t=>t.id===hit.id))inspect(hit.id);else toast(`Move closer to ${hit.name||hit.label} to interact.`);}});
function frame(now){const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;if(!paused()){const dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);const dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);if(dx||dy)movePlayer(state,dx,dy,dt);if(now-lastSave>5000)save();}renderer.draw(state,getRegion(state),now/1000);if(now-lastUI>150){refresh();lastUI=now;}requestAnimationFrame(frame);}
window.addEventListener('resize',()=>renderer.resize());refresh();requestAnimationFrame(frame);
async function checkConnection(){
 const requestId=++connectionRequest;
 try{const response=await fetch('/api/dm');if(!response.ok)return;const status=await response.json();if(requestId!==connectionRequest)return;connection=status;live=Boolean(connection.configured);$('dm-status').classList.toggle('live',live);$('dm-status').querySelector('span').textContent=live?(connection.localSignInAvailable?'Using ChatGPT plan':'Live AI configured'):(connection.localSignInAvailable?'Connect ChatGPT':'Local storyteller');$('intent-mode').textContent=live?(connection.localSignInAvailable?'Using ChatGPT plan':'Interpreted by the live chronicler'):'Grounded in local rules';}catch{}
}
checkConnection();
window.addEventListener('focus',checkConnection);
