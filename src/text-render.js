export const TEXT_TEMPLATES = {
  clean: { font: 'BVPro', color: '#ffffff', effect: 'shadow', size: 38, animation: 'none', stretchX: 100, stretchY: 100 },
  editorial: { font: 'Playfair', color: '#294e45', effect: 'none', size: 46, animation: 'fade', stretchX: 100, stretchY: 100 },
  poster: { font: 'Oswald', color: '#fff0bd', effect: 'outline', size: 54, animation: 'pop', stretchX: 100, stretchY: 100 },
  neon: { font: 'BVPro', color: '#9cf8e8', effect: 'glow', size: 40, animation: 'pulse', stretchX: 100, stretchY: 100 },
  glass: { font: 'BVPro', color: '#ffffff', effect: 'card', size: 32, animation: 'slide', stretchX: 100, stretchY: 100 },
  shimmer: { font: 'Playfair', color: '#ffdb9a', effect: 'gradient', size: 46, animation: 'float', stretchX: 100, stretchY: 100 },
};
export function newText(id) { return { id, text: 'Ý tưởng thành hình.', ...TEXT_TEMPLATES.clean, template: 'clean', x: 50, y: 12, rotation: 0, spacing: 0, opacity: 100, align: 'center' }; }

function drawLine(ctx, text, x, y, spacing, stroke=false) {
  if (!spacing) { if (stroke) ctx.strokeText(text,x,y); else ctx.fillText(text,x,y); return; }
  const chars = [...text];
  const total = chars.reduce((sum,ch)=>sum+ctx.measureText(ch).width,0)+Math.max(0,chars.length-1)*spacing;
  let cursor = x-total/2;
  ctx.textAlign = 'left';
  for(const ch of chars){if(stroke)ctx.strokeText(ch,cursor,y);else ctx.fillText(ch,cursor,y);cursor+=ctx.measureText(ch).width+spacing;}
  ctx.textAlign = 'center';
}

export function drawTexts(ctx, texts, width, height, timestamp) {
  const boxes=[];
  for (const item of texts) {
    if (!item.text.trim()) continue;
    const unit=Math.min(width,height)/540, size=item.size*unit;
    let content=item.text, opacity=item.opacity/100, dy=0, scale=1;
    const t=Math.max(0,timestamp), entrance=Math.min(1,t/.8), ease=1-Math.pow(1-entrance,3);
    if(item.animation==='fade')opacity*=entrance;
    if(item.animation==='slide'){opacity*=entrance;dy=(1-ease)*size*1.5;}
    if(item.animation==='pop'){opacity*=entrance;scale=.6+.4*ease;}
    if(item.animation==='float')dy=Math.sin(t*2)*size*.16;
    if(item.animation==='pulse')opacity*=.7+.3*(.5+.5*Math.sin(t*3));
    if(item.animation==='typewriter')content=[...content].slice(0,Math.floor(t*18)+1).join('');
    const x=width*item.x/100,y=height*item.y/100+dy,stretchX=item.stretchX/100*scale,stretchY=item.stretchY/100*scale;
    ctx.save();ctx.translate(x,y);ctx.rotate(item.rotation*Math.PI/180);ctx.scale(stretchX,stretchY);ctx.globalAlpha=opacity;
    ctx.font=`800 ${size}px "${item.font}",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    const lines=content.split('\n'), spacing=item.spacing*unit;
    const widths=lines.map(line=>ctx.measureText(line).width+Math.max(0,[...line].length-1)*spacing);
    const maxWidth=Math.max(...widths), totalHeight=lines.length*size*1.3;
    if(item.effect==='card'){ctx.fillStyle='#183c428c';ctx.beginPath();ctx.roundRect(-maxWidth/2-size*.45,-totalHeight/2-size*.25,maxWidth+size*.9,totalHeight+size*.5,size*.24);ctx.fill();}
    ctx.fillStyle=item.color;
    if(item.effect==='gradient'){const gradient=ctx.createLinearGradient(-maxWidth/2,0,maxWidth/2,0);gradient.addColorStop(0,item.color);gradient.addColorStop(.5,'#fff9e9');gradient.addColorStop(1,item.color);ctx.fillStyle=gradient;}
    if(item.effect==='shadow'){ctx.shadowColor='#091a2466';ctx.shadowBlur=size*.18;ctx.shadowOffsetY=size*.08;}
    if(item.effect==='glow'){ctx.shadowColor=item.color;ctx.shadowBlur=size*.42;}
    lines.forEach((line,i)=>{const ly=(i-(lines.length-1)/2)*size*1.3;const lx=item.align==='left' ? (widths[i]-maxWidth)/2 : item.align==='right' ? (maxWidth-widths[i])/2 : 0;
      if(item.effect==='outline'){ctx.strokeStyle='#0d1d2d';ctx.lineWidth=size*.065;ctx.lineJoin='round';drawLine(ctx,line,lx,ly,spacing,true);}
      drawLine(ctx,line,lx,ly,spacing);
    });
    ctx.restore();
    const bw=(maxWidth+size*.8)*stretchX,bh=(totalHeight+size*.5)*stretchY,angle=item.rotation*Math.PI/180;
    const boxW=Math.abs(bw*Math.cos(angle))+Math.abs(bh*Math.sin(angle)),boxH=Math.abs(bw*Math.sin(angle))+Math.abs(bh*Math.cos(angle));
    boxes.push({id:item.id,x:x-boxW/2,y:y-boxH/2,width:boxW,height:boxH});
  }
  return boxes;
}
