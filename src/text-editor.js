import { TEXT_TEMPLATES, newText } from './text-render.js';

export function createTextEditor({ getState, isBusy, canvas, renderer, redraw }) {
  const $ = (id) => document.getElementById(id);
  let selected = null, drag = null;
  const selectedText = () => getState().texts.find(t => t.id === selected);
  const numeric = { 'text-size':['size',''], 'text-stretch-x':['stretchX','%'], 'text-stretch-y':['stretchY','%'], 'text-x':['x','%'], 'text-y':['y','%'], 'text-rotation':['rotation','°'], 'text-spacing':['spacing',''], 'text-opacity':['opacity','%'] };
  const strings = { 'text-content':'text', 'text-font':'font', 'text-color':'color', 'text-align':'align', 'text-effect':'effect', 'text-animation':'animation' };
  const fontPromises = new Map();
  function loadFont(font) { if(!fontPromises.has(font))fontPromises.set(font,document.fonts.load(`800 48px "${font}"`,'Ý tưởng thành hình').catch(()=>[]));return fontPromises.get(font); }
  function syncLayerNames() {
    $('text-layer').replaceChildren();
    if(!getState().texts.length){const option=new Option('Chưa có lớp chữ','');$('text-layer').append(option);return;}
    getState().texts.forEach((t,i)=>$('text-layer').append(new Option(`${i+1}. ${t.text.slice(0,28)||'Chữ trống'}`,t.id)));
    $('text-layer').value=selected;
  }
  function sync() {
    if(!selectedText())selected=getState().texts[0]?.id || null;
    syncLayerNames();const item=selectedText();$('text-controls').hidden=!item;
    if(!item)return;
    $('text-template').value=item.template || 'custom';
    for(const [id,key] of Object.entries(strings))$(id).value=item[key];
    for(const [id,[key,unit]] of Object.entries(numeric)){$(id).value=item[key];$(`${id}-value`).textContent=`${Math.round(item[key])}${unit}`;}
    loadFont(item.font).then(redraw);
  }
  $('add-text').onclick=()=>{if(isBusy())return;if(getState().texts.length>=8){$('toast').textContent='Bạn có thể dùng tối đa 8 lớp chữ.';$('toast').hidden=false;return;}const item=newText(crypto.randomUUID());item.y=12+getState().texts.length*9;getState().texts.push(item);selected=item.id;sync();redraw();};
  $('quick-add-text').onclick=()=>{$('add-text').click();if(innerWidth>940){const panel=document.querySelector('.controls');panel.scrollTop=document.querySelector('.text-section').offsetTop-panel.offsetTop-15;}};
  $('text-layer').onchange=()=>{selected=$('text-layer').value;sync();redraw();};
  $('delete-text').onclick=()=>{if(isBusy())return;getState().texts=getState().texts.filter(t=>t.id!==selected);selected=null;sync();redraw();};
  $('text-template').onchange=()=>{const item=selectedText();const template=TEXT_TEMPLATES[$('text-template').value];if(!item||!template||isBusy())return;Object.assign(item,template,{template:$('text-template').value});sync();redraw();};
  for(const [id,key] of Object.entries(strings))$(id).oninput=()=>{const item=selectedText();if(!item||isBusy())return;item[key]=$(id).value;item.template='custom';$('text-template').value='custom';if(key==='text')syncLayerNames();if(key==='font')loadFont(item.font).then(redraw);redraw();};
  for(const [id,[key,unit]] of Object.entries(numeric))$(id).oninput=()=>{const item=selectedText();if(!item||isBusy())return;item[key]=Number($(id).value);item.template='custom';$('text-template').value='custom';$(`${id}-value`).textContent=`${item[key]}${unit}`;redraw();};
  function point(event){const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*canvas.width,y:(event.clientY-rect.top)/rect.height*canvas.height};}
  canvas.addEventListener('pointerdown',event=>{
    if(isBusy())return;const p=point(event);const box=[...(renderer.textBoxes||[])].reverse().find(b=>p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height);
    if(box){selected=box.id;sync();const item=selectedText();drag={type:'text',item,start:p,x:item.x,y:item.y};}
    else {const b=renderer.phoneBounds;if(!b||p.x<b.x||p.x>b.x+b.width||p.y<b.y||p.y>b.y+b.height)return;drag={type:'phone',start:p,x:getState().deviceX,y:getState().deviceY};}
    canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag||isBusy())return;const p=point(event),x=Math.max(0,Math.min(100,drag.x+(p.x-drag.start.x)/canvas.width*100)),y=Math.max(0,Math.min(100,drag.y+(p.y-drag.start.y)/canvas.height*100));
    if(drag.type==='text'){drag.item.x=x;drag.item.y=y;for(const [id,n] of [['text-x',x],['text-y',y]]){$(id).value=n;$(`${id}-value`).textContent=`${Math.round(n)}%`;}}
    else {getState().deviceX=x;getState().deviceY=y;for(const [id,n]of[['device-x',x],['device-y',y]]){$(id).value=n;$(`${id}-value`).textContent=`${Math.round(n)}%`;}}
    redraw();
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;canvas.style.cursor='grab';});
  sync();
  return { sync, async ensureFonts(){await Promise.all(getState().texts.map(t=>loadFont(t.font)));} };
}
