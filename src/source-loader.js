import { waitFor, checkActive } from './export-control.js';
// Metadata is sufficient for import. Safari may defer the first decoded frame.
// Each import owns its listeners; replacing a file aborts the old request.
export async function attachVideo(video, url, { signal, timeout=25000 } = {}) {
  checkActive(signal);
  let cleanup;
  const ready = new Promise((resolve,reject)=>{
    const done=()=>{if(video.readyState>=1&&video.videoWidth&&Number.isFinite(video.duration)&&video.duration>0){cleanup();resolve({width:video.videoWidth,height:video.videoHeight,duration:video.duration});}};
    const failed=()=>{cleanup();reject(new Error('Không đọc được video này. Hãy thử MP4 H.264, hoặc tải video từ iCloud về máy trước khi chọn.'));};
    cleanup=()=>{video.removeEventListener('loadedmetadata',done);video.removeEventListener('durationchange',done);video.removeEventListener('error',failed);};
    video.addEventListener('loadedmetadata',done);video.addEventListener('durationchange',done);video.addEventListener('error',failed);
    video.preload='metadata'; video.src=url; video.load(); done();
  });
  try{return await waitFor(ready,{signal,timeout,message:'Video chưa phản hồi. Hãy chọn lại tệp hoặc tải bản gốc từ iCloud về máy.'});}
  finally{cleanup?.();}
}

import { Input, BlobSource, ALL_FORMATS } from 'mediabunny';
export async function readMetadata(file,{signal}={}) {
  const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
  try{
    return await waitFor((async()=>{
      const track=await input.getPrimaryVideoTrack();
      if(!track)throw new Error('Tệp không có đường hình video.');
      const [width,height,duration]=await Promise.all([track.getDisplayWidth(),track.getDisplayHeight(),(async()=>{const value=await track.getDurationFromMetadata();return value&&Number.isFinite(value)?value:track.computeDuration();})()]);
      if(!width||!height||!Number.isFinite(duration)||duration<=0)throw new Error('Thông tin video không hợp lệ.');
      return {width,height,duration};
    })(),{signal,timeout:25000,message:'Không đọc được thông tin video. Hãy tải bản gốc từ iCloud về máy trước khi chọn.'});
  }finally{input.dispose();}
}

export async function loadImage(url) {
  let failure;
  for(let attempt=0;attempt<2;attempt++) {
    const image=new Image();
    const ready=new Promise((resolve,reject)=>{
      image.onload=()=>image.naturalWidth?resolve(image):reject(new Error('Ảnh khung rỗng.'));
      image.onerror=()=>reject(new Error('Không tải được ảnh khung.'));
      const target=new URL(url,document.baseURI);if(attempt)target.searchParams.set('retry',String(attempt));image.src=target.href;
      if(image.complete&&image.naturalWidth)resolve(image);
    });
    try{return await waitFor(ready,{timeout:12000,message:'Tải khung iPhone quá lâu.'});}
    catch(error){failure=error;image.src='';}
    finally{image.onload=image.onerror=null;}
  }
  throw failure;
}
