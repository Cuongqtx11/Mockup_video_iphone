import {Input,BlobSource,ALL_FORMATS,Output,StreamTarget,Mp4OutputFormat,WebMOutputFormat,Conversion,Quality,getFirstEncodableVideoCodec,canEncodeAudio} from 'mediabunny';
import {openTemporaryOutput,openChosenOutput} from './file-storage.js';
import {createRenderer} from './render.js';
import {waitFor,checkActive} from './export-control.js';
// Use the page's codec implementation and loaded images. Decode/compose/encode
// each frame with backpressure; yield every frame so controls remain usable.
export async function exportSequence({file,state,variant,assets,backgroundImage,backgroundUrl,width,height,bitrate,fps,audio,handle,signal,progress,onSlot,onStop}) {
  if(!window.VideoEncoder||!window.VideoDecoder)return null;
  const wait=p=>waitFor(p,{signal,timeout:25000});
  let input,slot,conversion,render,timer,done=false;
  try{
    progress(0,'Kiểm tra bộ mã hóa…');
    const mp4=await wait(getFirstEncodableVideoCodec(['avc'],{width,height,bitrate}));
    const codec=mp4||(!handle&&await wait(getFirstEncodableVideoCodec(['vp9','vp8'],{width,height,bitrate})));
    if(!codec)return null;
    input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
    const track=await wait(input.getPrimaryVideoTrack());if(!track||!(await wait(track.canDecode())))return null;
    const duration=await wait(track.computeDuration());
    const audioTrack=audio?await wait(input.getPrimaryAudioTrack()):null;
    if(mp4&&audioTrack&&await wait(audioTrack.getCodec())!=='aac'&&!(await wait(canEncodeAudio('aac')))){const {registerAacEncoder}=await import('@mediabunny/aac-encoder');registerAacEncoder();}
    slot=handle?await openChosenOutput(handle,{signal}):await openTemporaryOutput(mp4?'mp4':'webm',{signal,onName:name=>onSlot(name)});
    const output=new Output({target:new StreamTarget(new WritableStream({write:chunk=>slot.write(chunk)}),{chunked:true,chunkSize:1024*1024}),format:mp4?new Mp4OutputFormat({fastStart:false}):new WebMOutputFormat()});
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});render=createRenderer(()=>({state,variant,assets,backgroundImage,backgroundUrl,pendingVideo:true}));
    let frames=0,lastMotion=performance.now(),lastReport=0;
    const stop=()=>{conversion?.cancel().catch(()=>{});};onStop(stop);
    conversion=await wait(Conversion.init({input,output,tracks:'primary',video:{codec,quality:new Quality({bitrate}),frameRate:fps,processedWidth:width,processedHeight:height,allowTransformationMetadata:false,async process(sample){
      checkActive(signal);render(ctx,sample,sample.displayWidth,sample.displayHeight,sample.timestamp);frames++;lastMotion=performance.now();
      if(lastMotion-lastReport>200){lastReport=lastMotion;progress(Math.min(.96,sample.timestamp/duration*.96),`Đã ghép ${frames} khung · ${Math.floor(sample.timestamp)} / ${Math.ceil(duration)} giây`);}
      await new Promise(resolve=>setTimeout(resolve,0));checkActive(signal);return canvas;
    }},audio:{discard:!audio,codec:mp4?'aac':'opus'}}));
    if(!conversion.isValid||conversion.discardedTracks.some(t=>t.reason!=='discarded_by_user'))return null;
    const stalled=new Promise((_,reject)=>{timer=setInterval(()=>{if(performance.now()-lastMotion>25000){stop();reject(new Error('Bộ mã hóa ngừng phản hồi. Hãy thử chế độ ghi theo thời gian thực ở HD.'));}},1000);});
    await waitFor(Promise.race([conversion.execute(),stalled]),{signal,timeout:Math.max(300000,duration*60000)});clearInterval(timer);
    checkActive(signal);progress(.98,'Đang đóng tệp video…');const result=await slot.commit();done=true;
    return {file:result,slotName:handle?null:slot.name,mime:mp4?'video/mp4':'video/webm',extension:mp4?'mp4':'webm'};
  }finally{clearInterval(timer);if(!done){conversion?.cancel().catch(()=>{});slot?.abort().catch(()=>{});}onStop(null);input?.dispose();render?.dispose();}
}
